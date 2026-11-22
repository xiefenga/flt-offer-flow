export const maxImageBytes = 2 * 1024 * 1024;
export const maxMailHtml = 8 * 1024 * 1024;
export function isMailImage(src) {
  if (
    typeof src !== "string" ||
    src.length > Math.ceil(maxImageBytes / 3) * 4 + 32
  ) {
    return false;
  }
  // Check the file signature as well as the declared MIME type.
  return /^data:image\/(?:png;base64,iVBORw0KGgo|jpeg;base64,\/9j\/|gif;base64,R0lGOD[dl]h)[A-Za-z0-9+/]*={0,2}$/.test(
    src,
  );
}
export function isWebLink(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function imagePresentation(width, align, radius) {
  const pixels = (value, max, fallback) =>
    /^\d{1,4}$/.test(String(value)) && Number(value) <= max
      ? Number(value)
      : fallback;
  const w = pixels(width, 1600, 240) || 240;
  const r = pixels(radius, 100, 0);
  const margins = { left: "0 auto 0 0", center: "0 auto", right: "0 0 0 auto" };
  const position = Object.hasOwn(margins, align) ? align : "inline";
  return {
    width: String(w),
    "data-align": position,
    "data-radius": String(r),
    style:
      "max-width:100%;height:auto;border-radius:" +
      r +
      "px" +
      (position === "inline"
        ? ""
        : ";display:block;margin:" + margins[position]),
  };
}
