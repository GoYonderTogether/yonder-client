declare module "word-extractor/lib/buffer-reader.js" {
	export default class BufferReader {
		constructor(buffer: Uint8Array);
	}
}

declare module "word-extractor/lib/word-ole-extractor.js" {
	import type BufferReader from "word-extractor/lib/buffer-reader.js";
	export default class WordOleExtractor {
		extract(reader: BufferReader): Promise<{ getBody(): string }>;
	}
}
