import { useRef } from "react";

/**
 * The legacy `ComposerFileInputs` pickers. A picker hands back its files after `click()` returns, and
 * the person may have switched composer scope (another chat, the 「我」 overlay) while the OS sheet was
 * open. The picker therefore remembers which scope asked, and a mobile direct-send target takes the
 * files only when that scope is still the current one.
 */
export function useFilePicker({
	scope,
	mobile,
	pickedFiles,
	onFiles,
	interrupt,
}: {
	scope: string;
	mobile: boolean;
	pickedFiles: { send: (files: File[], original: boolean) => void } | undefined;
	onFiles: (files: File[]) => void;
	interrupt: () => void;
}) {
	const askedBy = useRef<string | undefined>(undefined);
	function open(input: HTMLInputElement | null) {
		askedBy.current = scope;
		input?.click();
	}
	function receive(selected: File[], original: boolean) {
		const requested = askedBy.current;
		askedBy.current = undefined;
		interrupt();
		if (mobile && requested !== undefined && requested !== scope) return;
		if (mobile && pickedFiles && requested !== undefined) {
			pickedFiles.send(selected, original);
			return;
		}
		onFiles(selected);
	}
	return { open, receive };
}
