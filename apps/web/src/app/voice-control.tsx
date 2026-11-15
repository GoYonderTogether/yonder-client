import { Mic, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

export function VoiceControl({
	disabled,
	listening,
	onStart,
	onPause,
}: {
	disabled: boolean;
	listening: boolean;
	onStart: () => void;
	onPause: () => void;
}) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			className="composer-tool"
			aria-label={t(listening ? "chat.stopRecording" : "chat.voiceInput")}
			onMouseDown={(event) => event.preventDefault()}
			onClick={listening ? onPause : onStart}
			disabled={disabled}
		>
			{listening ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
		</button>
	);
}
