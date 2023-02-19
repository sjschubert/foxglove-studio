// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { useMemo } from "react";
import Zfp from "wasm-zfp";

import { NormalizedImageMessage } from "../types";

function useCompressedImage(): NormalizedImageMessage | undefined {
  const imageFormat = "image/png";

  const [imageData, setImageData] = React.useState<Uint8Array | undefined>();
  React.useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 400, 300);
    gradient.addColorStop(0, "cyan");
    gradient.addColorStop(1, "green");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 300);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "red";
    ctx.strokeRect(0, 0, 400, 300);
    canvas.toBlob((blob) => {
      void blob?.arrayBuffer().then((arrayBuffer) => {
        setImageData(new Uint8Array(arrayBuffer));
      });
    }, imageFormat);
  }, []);

  return useMemo(() => {
    if (!imageData) {
      return;
    }

    return {
      type: "compressed",
      stamp: { sec: 0, nsec: 0 },
      format: imageFormat,
      data: imageData,
    };
  }, [imageData]);
}

function useZfpCompressedImage(): NormalizedImageMessage | undefined {
  const [imageData, setImageData] = React.useState<Uint8Array | undefined>();
  React.useEffect(() => {
    const width = 400;
    const height = 300;
    const int32Data = new Int32Array(width * height);
    // Create a grayscale gradient from top-left to bottom-right
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        int32Data[y * width + x] = ((x + y) * 10000) / (width + height);
      }
    }

    const zfpBuffer = Zfp.createBuffer();
    const compressed = Zfp.compress(zfpBuffer, {
      data: int32Data,
      shape: [width, height, 0, 0],
      dimensions: 2,
    });
    Zfp.freeBuffer(zfpBuffer);

    setImageData(compressed);
  }, []);

  return useMemo(() => {
    if (!imageData) {
      return;
    }

    return {
      type: "compressed",
      stamp: { sec: 0, nsec: 0 },
      format: "zfp",
      data: imageData,
    };
  }, [imageData]);
}

export { useCompressedImage, useZfpCompressedImage };
