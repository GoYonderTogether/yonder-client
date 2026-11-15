import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

GlobalWorkerOptions.workerSrc = workerUrl;

export { getDocument };
