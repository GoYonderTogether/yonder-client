import "./legacy-word-buffer.ts";
import { Buffer } from "buffer/";
import BufferReader from "word-extractor/lib/buffer-reader.js";
import WordOleExtractor from "word-extractor/lib/word-ole-extractor.js";

const MAX_WORD_BYTES = 20 * 1024 * 1024;
const MAX_CHARACTERS = 200_000;

self.onmessage = async ({ data: blob }: MessageEvent<Blob>) => {
	try {
		if (blob.size < 512 || blob.size > MAX_WORD_BYTES) throw new Error("invalid_word_size");
		const bytes = Buffer.from(await blob.arrayBuffer());
		const reader = new BufferReader(bytes);
		const document = await new WordOleExtractor().extract(reader);
		const text = document.getBody();
		self.postMessage({ text: text.slice(0, MAX_CHARACTERS), truncated: text.length > MAX_CHARACTERS });
	} catch {
		self.postMessage(null);
	}
};
