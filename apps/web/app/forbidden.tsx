import { ForbiddenMessage } from "@/components/forbidden-message";

// Rendered with status 403 when a server component calls `forbidden()`.
export default function Forbidden() {
  return <ForbiddenMessage />;
}
