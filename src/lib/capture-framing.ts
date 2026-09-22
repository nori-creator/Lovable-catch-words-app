/** Crop the video to exactly the object-cover viewport, including digital zoom. */
export function viewfinderCrop(
  videoWidth: number,
  videoHeight: number,
  width: number,
  height: number,
  zoom = 1,
) {
  const scale = Math.max(width / videoWidth, height / videoHeight) * Math.max(1, zoom);
  const sw = width / scale,
    sh = height / scale;
  return { sx: (videoWidth - sw) / 2, sy: (videoHeight - sh) / 2, sw, sh };
}
