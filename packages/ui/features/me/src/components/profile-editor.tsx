import type { Member } from "@yonder/protocol";
import { Avatar, Button, ListGroup } from "@yonder/ui-components";
import { useUpdateMe, useUploadAvatar } from "@yonder/ui-data";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ProfileEditorProps {
	person: Member;
}

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * The top of 「我」: avatar and name, both editable in place. The avatar uploads as soon as a file
 * is chosen and shows from a local preview meanwhile; the name saves on blur or Enter. Both go
 * through the query cache, so another open tab hears about it over the realtime channel.
 */
export function ProfileEditor({ person }: ProfileEditorProps) {
	const { t } = useTranslation();
	const update = useUpdateMe();
	const upload = useUploadAvatar();
	const fileInput = useRef<HTMLInputElement>(null);

	const [name, setName] = useState(person.displayName);
	const [preview, setPreview] = useState<string | null>(person.avatarUrl);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const commitName = () => {
		const trimmed = name.trim();
		if (trimmed === "" || trimmed === person.displayName) return;
		if ([...trimmed].length > 40) {
			setError(t("profile.nameTooLong"));
			return;
		}
		setError(null);
		update.mutate(
			{ displayName: trimmed },
			{
				onSuccess: () => setMessage(t("profile.saved")),
				onError: () => setError(t("profile.saveFailed")),
			},
		);
	};

	const chooseFile = async (file: File) => {
		setError(null);
		setMessage(null);
		if (!TYPES.includes(file.type)) {
			setError(t("profile.avatarWrongType"));
			return;
		}
		if (file.size > MAX_BYTES) {
			setError(t("profile.avatarTooLarge"));
			return;
		}
		setPreview(URL.createObjectURL(file));
		try {
			const me = await upload.mutateAsync(file);
			setPreview(me.member.avatarUrl);
			setMessage(t("profile.saved"));
		} catch {
			setPreview(person.avatarUrl);
			setError(t("profile.uploadFailed"));
		}
	};

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex flex-col items-center gap-[var(--spacing-3)] pt-[var(--spacing-4)]">
				<button
					type="button"
					onClick={() => fileInput.current?.click()}
					aria-label={t("profile.avatar")}
					tabIndex={-1}
					className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
				>
					<Avatar name={person.displayName} src={preview} size={80} />
					<span className="absolute -end-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-[var(--color-bg-base)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-fast)] group-hover:scale-105">
						<Camera size={15} strokeWidth={1.9} aria-hidden="true" />
					</span>
				</button>
				<Button type="button" variant="link" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
					{t("profile.changeAvatar")}
				</Button>
			</div>
			<ListGroup footer={`@${person.handle}`}>
				<li className="flex min-h-[var(--row-height)] items-center gap-[var(--spacing-3)] px-[var(--spacing-4)]">
					<label htmlFor="profile-name" className="shrink-0 text-body text-[var(--color-text-secondary)]">
						{t("profile.name")}
					</label>
					<input
						id="profile-name"
						aria-label={t("profile.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						onBlur={commitName}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitName();
							}
						}}
						maxLength={40}
						className="min-w-0 flex-1 bg-transparent text-end text-body text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
						placeholder={t("profile.namePlaceholder")}
					/>
				</li>
			</ListGroup>
			<input
				ref={fileInput}
				type="file"
				accept={TYPES.join(",")}
				className="sr-only"
				aria-label={t("profile.avatar")}
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) void chooseFile(file);
					event.target.value = "";
				}}
			/>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : message ? (
				<p className="text-caption text-[var(--color-text-tertiary)]">{message}</p>
			) : null}
		</div>
	);
}
