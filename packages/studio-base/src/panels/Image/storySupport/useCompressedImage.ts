// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import * as base64 from "@protobufjs/base64";
import { useMemo } from "react";

import { NormalizedImageMessage } from "../types";

const ZFP_BASE64_DATA =
  "emZwBfQCAPABAACIHwAA0BkAmIF9AACwPIMIO7APAACGZxBxBvYBALDIMwi4A/sAAFjgXUCYgX0AAKzyLgDswD4AAFZ4FwBnYB8AAIO8i4g7sA8AgAHeRYAZ2AcAwCjvAMIO7AMAYIR3AHEG9gEALCLvAOAO7AMAgOUZRNiBfQAAMDyDiDOwDwCARZ5BwB3YBwDAAu8CwgzsAwBglXcBYAf2AQCwwrsAOAP7AAAY5F1E3IF9AAAM8C4CzMA+AABGeQcQdmAfAAAjvAOIM7APAGAReQcAd2AfAMAi8A4izMA+AAAYnkHEGdgHAMAizyDgDuwDAGCBdwFhBvYBALDKuwCwA/sAAFjhXQCcgX0AAAzyLiLuwD4AAAZ4FwFmYB8AAKO8Awg7sA8AgBHeAcQZ2AcAsIi8A4A7sA8AYBF4BxFmYB8AwKLyDgLswD4AABZ5BgF3YB8AAAu8CwgzsA8AgFXeBYAd2AcAwArvAuAM7AMAYJB3EXEH9gEAMMC7CDAD+wAAGOUdQNiBfQAAjPAOIM7APgCAReQdANyBfQAAi8A7iDAD+wAAFpV3EGAH9gEALArvIOAM7AMAYIF3AWEG9gEAsMq7ALAD+wAAWOFdAJyBfQAADPIuIu7APgAABngXAWZgHwAAo7wDCDuwDwCAEd4BxBnYBwCwiLwDgDuwDwBgEXgHEWZgHwDAovIOAuzAPgCAReEdBJyBfQAAi+KzgLgD+wAAWOVdANiBfQAArPAuAM7APgAABnkXEXdgHwAAA7yLADOwDwCAUd4BhB3YBwDACO8A4gzsAwBYRN4BwB3YBwCwCLyDCDOwDwBgUXkHAXZgHwDAovAOAs7APgCARfFZQNyBfQAAC+izADAD+wAAWOFdAJyBfQAADPIuIu7APgAABngXAWZgHwAAo7wDCDuwDwCAEd4BxBnYBwCwiLwDgDuwDwBgEXgHEWZgHwDAovIOAuzAPgCAReEdBJyBfQAAi+KzgLgD+wAAFtBnAWAG9gEALIDPIsIO7AMAYJB3EXEH9gEAMMC7CDAD+wAAGOUdQNiBfQAAjPAOIM7APgCAReQdANyBfQAAi8A7iDAD+wAAFpV3EGAH9gEALArvIOAM7AMAWBSfBcQd2AcAsIA+CwAzsA8AYAF8FhF2YB8AwIL6LCLOwAA=";

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
  return useMemo(() => {
    const imageData = new Uint8Array(base64.length(ZFP_BASE64_DATA));
    base64.decode(ZFP_BASE64_DATA, imageData, 0);

    return {
      type: "compressed",
      stamp: { sec: 0, nsec: 0 },
      format: "zfp",
      data: imageData,
    };
  }, []);
}

export { useCompressedImage, useZfpCompressedImage };
