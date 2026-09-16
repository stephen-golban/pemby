import Image, {
  alt as ogAlt,
  contentType as ogContentType,
  size as ogSize,
} from "./opengraph-image";

// Same card as Open Graph. Next reads these exports from this file, so they are restated here.
export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default Image;
