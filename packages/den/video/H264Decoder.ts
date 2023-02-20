// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";

import { Bitstream, NALUStream, NaluStreamInfo, NaluType, SPS } from "./h264Utils";

export type H264DecoderEventTypes = {
  frame: (frame: VideoFrame) => void;
  debug: (message: string) => void;
  warn: (message: string) => void;
  error: (error: Error) => void;
};

export class H264Decoder extends EventEmitter<H264DecoderEventTypes> {
  #decoder: VideoDecoder;
  #naluStreamInfo: NaluStreamInfo | undefined;
  #videoDecoderConfig: VideoDecoderConfig | undefined;
  #hasKeyframe = false;
  #decoding: Promise<void> | undefined;
  #pendingFrame: VideoFrame | undefined;
  #timestamp = 0;

  public static isSupported(): boolean {
    return self.isSecureContext && "VideoDecoder" in globalThis;
  }

  public constructor() {
    super();
    this.#decoder = new VideoDecoder({
      error: (error) => this.emit("error", error),
      output: (frame) => this.emit("frame", frame),
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
    if (this.#decoding) {
      await this.#decoding;
    }

    if (this.#decoder.state === "closed") {
      this.emit("warn", "VideoDecoder is closed, creating a new one");
      this.#decoder = new VideoDecoder({
        error: (error) => this.emit("error", error),
        output: (frame) => this.emit("frame", frame),
      });
    }

    // Convert the data to Annex B format if necessary
    const annexBFrame = this._getAnnexBFrame(data);
    if (!annexBFrame) {
      this.emit(
        "error",
        new Error(`Unable to convert ${data.byteLength} byte bitstream to Annex B format`),
      );
      return undefined;
    }

    // Configure the VideoDecoder if needed
    if (this.#decoder.state === "unconfigured") {
      const decoderConfig = this._getDecoderConfig(annexBFrame);
      if (decoderConfig != undefined) {
        this.emit("debug", `Configuring VideoDecoder with ${JSON.stringify(decoderConfig)}`);
        this.#decoder.configure(decoderConfig);
      }
    }

    if (this.#decoder.state !== "configured") {
      this.emit("warn", `VideoDecoder is in state ${this.#decoder.state}, skipping frame`);
      return undefined;
    }

    const type = isKeyFrame(annexBFrame) ? "key" : "delta";
    if (!this.#hasKeyframe) {
      if (type === "key") {
        this.#hasKeyframe = true;
      } else {
        this.emit("debug", `Skipping non-keyframe before keyframe`);
        return undefined;
      }
    }

    this.#decoding = new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.emit(
          "warn",
          `Timed out decoding ${data.byteLength} byte chunk at time ${timestampMicros}`,
        );
        resolve(undefined);
      }, 30);
      this.once("frame", (videoFrame) => {
        this.emit(
          "debug",
          `Decoded ${data.byteLength} byte ${type} chunk at time ${timestampMicros} to ${videoFrame.displayWidth}x${videoFrame.displayHeight} ${videoFrame.format}`,
        );
        clearTimeout(timeoutId);
        if (this.#pendingFrame) {
          this.#pendingFrame.close();
        }
        this.#pendingFrame = videoFrame;
        resolve();
      });

      try {
        this.#decoder.decode(
          new EncodedVideoChunk({
            type,
            data: annexBFrame,
            timestamp: this.#timestamp++, //timestampMicros,
          }),
        );
      } catch (unk) {
        const err = unk as Error;
        this.emit(
          "error",
          new Error(
            `Failed to decode ${data.byteLength} byte chunk at time ${timestampMicros}: ${err.message}`,
          ),
        );
      }
    });

    await this.#decoding;
    this.#decoding = undefined;

    const maybeVideoFrame = this.#pendingFrame;
    this.#pendingFrame = undefined;
    return maybeVideoFrame;
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
      this.#naluStreamInfo = this._identifyNaluStreamInfo(data);
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

  private _identifyNaluStreamInfo(buffer: Uint8Array): NaluStreamInfo | undefined {
    try {
      const stream = new NALUStream(buffer, { strict: true });
      if (stream.type && stream.type !== "unknown" && stream.boxSize != undefined) {
        return { type: stream.type, boxSize: stream.boxSize };
      }
      this.emit("error", new Error(`Unable to identify NALU stream`));
    } catch (unk) {
      const err = unk as Error;
      this.emit("error", new Error(`Unable to identify NALU stream: ${err.message}`));
    }
    return undefined;
  }
}

function isKeyFrame(annexBFrame: Uint8Array): boolean {
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
