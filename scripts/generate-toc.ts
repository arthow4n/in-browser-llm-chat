import * as fs from "node:fs";
import * as path from "node:path";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function generateTOC(content: string) {
  const lines = content.split("\n");
  const toc: string[] = [];
  const headerRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();

      // Skip "Table of Contents" header to avoid self-reference
      if (title.toLowerCase() === "table of contents") continue;

      const slug = slugify(title);
      const indent = "  ".repeat(level - 1);
      toc.push(`${indent}- [${title}](#${slug})`);
    }
  }

  return toc.join("\n");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Please provide a markdown file path.");
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const toc = generateTOC(content);

  const startMarker = "<!-- TOC -->";
  const endMarker = "<!-- ENDTOC -->";
  const warning =
    "<!-- This Table of Contents is generated automatically. Do not edit it manually. -->";
  const tocRegex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "g");

  if (!content.includes(startMarker) || !content.includes(endMarker)) {
    console.error("Markers <!-- TOC --> and <!-- ENDTOC --> not found in the file.");
    console.error("Please add them to the file where you want the TOC to be generated.");
    process.exit(1);
  }

  const replacement = `${startMarker}\n${warning}\n${toc}\n${endMarker}`;
  const newContent = content.replace(tocRegex, replacement);

  if (content === newContent) {
    console.log("TOC is already up to date.");
  } else {
    fs.writeFileSync(absolutePath, newContent, "utf8");
    console.log(`Successfully updated TOC in ${filePath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
