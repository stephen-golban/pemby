import { slugify } from "./markdown";

// Minimal structural view of a hast node; enough for the two passes below.
type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

function textOf(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function elements(node: Node, tagName: string): Node[] {
  const found: Node[] = [];
  for (const child of node.children ?? []) {
    if (child.type === "element" && child.tagName === tagName) found.push(child);
    found.push(...elements(child, tagName));
  }
  return found;
}

/**
 * Gives every `h2` a stable id (the same slug the table of contents uses), and gives every table
 * cell a `data-label` with its column header, so tables can stack into labelled rows on phones.
 */
export function rehypeLegal() {
  return (tree: Node) => {
    for (const heading of elements(tree, "h2")) {
      heading.properties = { ...heading.properties, id: slugify(textOf(heading)) };
    }
    for (const table of elements(tree, "table")) {
      const headers = elements(table, "th").map(textOf);
      for (const row of elements(table, "tr")) {
        (row.children ?? [])
          .filter((cell) => cell.type === "element" && cell.tagName === "td")
          .forEach((cell, index) => {
            cell.properties = { ...cell.properties, dataLabel: headers[index] ?? "" };
          });
      }
    }
  };
}
