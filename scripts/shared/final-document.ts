export type FinalDocumentSection = {
  level: number;
  title: string;
  content: string;
};

export type ParsedFinalDeliveryDocument = {
  rawMarkdown: string;
  sections: FinalDocumentSection[];
};

export function parseFinalDeliveryDocument(markdown: string): ParsedFinalDeliveryDocument {
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const matches = Array.from(markdown.matchAll(headingPattern));
  const sections = matches.map((match, index) => {
    const start = match.index ?? 0;
    const contentStart = start + match[0].length;
    const nextStart = matches[index + 1]?.index ?? markdown.length;
    return {
      level: match[1].length,
      title: match[2].trim(),
      content: markdown.slice(contentStart, nextStart).trim()
    };
  });

  return {
    rawMarkdown: markdown,
    sections
  };
}
