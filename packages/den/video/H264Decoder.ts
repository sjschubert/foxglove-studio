// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";

import { Bitstream, NALUStream, NaluStreamInfo, NaluType, SPS } from "./h264Utils";

export async function drawH264ToCanvas(
  output: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  data: Uint8Array,
  timestampMicros: number,
  decoder: H264Decoder,
): Promise<void> {
  const frame = await decoder.decode(data, timestampMicros);
  if (!frame) {
    return undefined;
  }

  output.drawImage(frame, 0, 0);

  frame.close();
}

export type H264DecoderEventTypes = {
  debug: (message: string) => void;
  error: (error: Error) => void;
};

export class H264Decoder extends EventEmitter<H264DecoderEventTypes> {
  #decoder: VideoDecoder;
  #naluStreamInfo: NaluStreamInfo | undefined;
  #videoDecoderConfig: VideoDecoderConfig | undefined;
  #pendingFrame: VideoFrame | undefined;

  public static isSupported(): boolean {
    return "VideoDecoder" in window;
  }

  public constructor() {
    super();
    this.#decoder = new VideoDecoder({
      error: (error) => this.emit("error", error),
      output: (frame) => (this.#pendingFrame = frame),
    });
  }

  /**
   * Takes a chunk of encoded video bitstream, parses it into NAL units, and
   * passes each NAL unit to the VideoDecoder. A flush is performed after the
   * last NAL unit, and the resulting VideoFrame is returned or undefined if
   * no frame was decoded.
   * @param data A chunk of encoded video bitstream
   * @param timestampMicros The timestamp of the chunk of encoded video
   *   bitstream in microseconds relative to the start of the stream
   * @returns A VideoFrame or undefined if no frame was decoded
   */
  public async decode(data: Uint8Array, timestampMicros: number): Promise<VideoFrame | undefined> {
    if (this.#decoder.state === "closed") {
      this.emit("error", new Error("VideoDecoder is closed"));
      return undefined;
    }

    // Convert the data to Annex B format if necessary
    const annexBFrame = this._getAnnexBFrame(data);
    if (!annexBFrame) {
      return undefined;
    }

    // Configure the VideoDecoder if needed
    if (this.#decoder.state === "unconfigured") {
      const decoderConfig = this._getDecoderConfig(annexBFrame);
      if (decoderConfig != undefined) {
        this.#decoder.configure(decoderConfig);
      }
    }

    if (this.#decoder.state !== "configured") {
      return;
    }

    const chunk = new EncodedVideoChunk({
      type: hasKeyFrame(annexBFrame) ? "key" : "delta",
      data: annexBFrame,
      timestamp: timestampMicros,
    });

    try {
      this.#decoder.decode(chunk);
    } catch (unk) {
      const err = unk as Error;
      this.emit(
        "error",
        new Error(
          `Failed to decode ${data.byteLength} chunk at time ${timestampMicros}: ${err.message}`,
        ),
      );
      return undefined;
    }

    await this.#decoder.flush();

    // Return the most recently decoded frame if one is available
    const frame = this.#pendingFrame;
    this.#pendingFrame = undefined;
    return frame;
  }

  /**
   * Reset the VideoDecoder and clear any pending frames, but do not clear any
   * cached stream information or decoder configuration. This should be called
   * when seeking to a new position in the stream.
   */
  public resetForSeek(): void {
    this.#decoder.reset();
  }

  /**
   * Close the VideoDecoder and clear any pending frames. Also clear any cached
   * stream information or decoder configuration.
   */
  public close(): void {
    this.#decoder.close();
    this.#naluStreamInfo = undefined;
    this.#videoDecoderConfig = undefined;
  }

  /**
   * Coerce the given video bitstream data to Annex B format if necessary.
   */
  private _getAnnexBFrame(data: Uint8Array): Uint8Array | undefined {
    const streamInfo = this._getNaluStreamInfo(data);
    if (!streamInfo) {
      this.emit("error", new Error("Unable to identify NALU stream"));
      return undefined;
    }

    switch (streamInfo.type) {
      case "packet":
        return new NALUStream(data, {
          type: "packet",
          boxSize: streamInfo.boxSize,
        }).convertToAnnexB().buf;
      case "annexB":
        return data;
      case "unknown":
      default:
        this.emit("error", new Error(`Unhandled NALU stream type: ${streamInfo.type}`));
        return undefined;
    }
  }

  /**
   * Retrieve the stream type (packet ar Annex B) and box size from the given
   * data. If the stream type is already known, the existing value is returned.
   */
  private _getNaluStreamInfo(data: Uint8Array): NaluStreamInfo | undefined {
    if (!this.#naluStreamInfo) {
      this.#naluStreamInfo = identifyNaluStreamInfo(data);
      if (this.#naluStreamInfo) {
        const { type, boxSize } = this.#naluStreamInfo;
        this.emit("debug", `Stream identified as ${type} with box size: ${boxSize}`);
      }
    }
    return this.#naluStreamInfo;
  }

  /**
   * Searches the given Annex B frame for a valid SPS NAL unit and returns a
   * VideoDecoderConfig if one is found. If the decoder config is already
   * known, the existing value is returned.
   */
  private _getDecoderConfig(annexBFrame: Uint8Array): VideoDecoderConfig | undefined {
    if (this.#videoDecoderConfig != undefined) {
      return this.#videoDecoderConfig;
    }

    const stream = new NALUStream(annexBFrame, { type: "annexB" });
    for (const nalu of stream.nalus()) {
      if (!nalu) {
        continue;
      }

      const bitstream = new Bitstream(nalu.nalu);
      bitstream.seek(3);
      const nal_unit_type = bitstream.u(5);
      if (nal_unit_type === NaluType.SPS) {
        try {
          const sps = new SPS(nalu.nalu);
          this.#videoDecoderConfig = {
            codec: sps.MIME,
            codedHeight: sps.picHeight,
            codedWidth: sps.picWidth,
            hardwareAcceleration: "prefer-hardware",
            optimizeForLatency: true,
          };
          return this.#videoDecoderConfig;
        } catch (unk) {
          const err = unk as Error;
          this.emit("error", new Error(`Invalid SPS NAL unit: ${err.message}`));
          return undefined;
        }
      }
    }

    return undefined;
  }
}

function identifyNaluStreamInfo(buffer: Uint8Array): NaluStreamInfo | undefined {
  try {
    const stream = new NALUStream(buffer, { strict: true, type: "unknown" });
    if (stream.type && stream.type !== "unknown" && stream.boxSize != undefined) {
      return { type: stream.type, boxSize: stream.boxSize };
    }
  } catch (err) {
    // Ignore errors
  }
  return undefined;
}

function hasKeyFrame(annexBFrame: Uint8Array): boolean {
  const stream = new NALUStream(annexBFrame, { type: "annexB" });
  for (const nalu of stream.nalus()) {
    if (!nalu) {
      continue;
    }

    const bitstream = new Bitstream(nalu.nalu);
    bitstream.seek(3);
    const nal_unit_type = bitstream.u(5);
    if (nal_unit_type === NaluType.IDR) {
      return true;
    }
  }

  return false;
}
