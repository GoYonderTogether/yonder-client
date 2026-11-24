import type { Member } from "@yonder/protocol";
import { Avatar, Button, ListGroup } from "@yonder/ui-components";
import { AvatarImageTooLargeError, useUpdateMe, useUploadAvatar } from "@yonder/ui-data";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ProfileEditorProps {
	person: Member;
}

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
	const [nameError, setNameError] = useState<string | null>(null);
	const [avatarError, setAvatarError] = useState<string | null>(null);

	const commitName = () => {
		if (update.isPending) return;
		const trimmed = name.trim();
		if (!trimmed) {
			setMessage(null);
			setNameError(t("profile.nameRequired"));
			return;
		}
		if ([...trimmed].length > 40) {
			setMessage(null);
			setNameError(t("profile.nameTooLong"));
			return;
		}
		setName(trimmed);
		if (trimmed === person.displayName) return;
		setNameError(null);
		update.mutate(
			{ displayName: trimmed },
			{
				onSuccess: () => setMessage(t("profile.saved")),
				onError: () => setNameError(t("profile.saveFailed")),
			},
		);
	};

	const chooseFile = async (file: File) => {
		setAvatarError(null);
		setMessage(null);
		if (!TYPES.includes(file.type)) {
			setAvatarError(t("profile.avatarWrongType"));
			return;
		}
		const address = URL.createObjectURL(file);
		setPreview(address);
		try {
			const me = await upload.mutateAsync(file);
			setPreview(me.member.avatarUrl);
			setMessage(t("profile.saved"));
		} catch (error) {
			setPreview(person.avatarUrl);
			setAvatarError(t(error instanceof AvatarImageTooLargeError ? "profile.avatarTooLarge" : "profile.uploadFailed"));
		} finally {
			URL.revokeObjectURL(address);
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
					<span className="absolute -end-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-[var(--color-bg-base)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] transition-transform duration-[var(--duration-fast)] group-hover:scale-105">
						<Camera size={15} strokeWidth={1.9} aria-hidden="true" />
					</span>
				</button>
				<Button type="button" variant="link" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
					{t("profile.changeAvatar")}
				</Button>
			</div>
			<ListGroup footer={`@${person.handle}`}>
				<li className="px-[var(--spacing-4)]">
					<div className="flex min-h-[var(--row-height)] items-center gap-[var(--spacing-3)]">
						<label htmlFor="profile-name" className="shrink-0 text-body text-[var(--color-text-secondary)]">
							{t("profile.name")}
						</label>
						<input
							id="profile-name"
							aria-invalid={Boolean(nameError) || undefined}
							aria-describedby={nameError ? "profile-name-error" : undefined}
							value={name}
							disabled={update.isPending}
							onChange={(event) => {
								setName(event.target.value);
								setNameError(null);
								setMessage(null);
							}}
							onBlur={commitName}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing) {
									event.preventDefault();
									commitName();
								}
							}}
							maxLength={40}
							className="min-w-0 flex-1 rounded-[var(--radius-xs)] bg-transparent text-end text-body text-[var(--color-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] placeholder:text-[var(--color-text-tertiary)]"
							placeholder={t("profile.namePlaceholder")}
						/>
					</div>
					{nameError ? (
						<p
							id="profile-name-error"
							role="alert"
							className="pb-[var(--spacing-3)] text-caption text-[var(--color-danger)]"
						>
							{nameError}
						</p>
					) : null}
				</li>
			</ListGroup>
			<input
				ref={fileInput}
				type="file"
				disabled={upload.isPending}
				accept={TYPES.join(",")}
				className="sr-only"
				aria-label={t("profile.avatar")}
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) void chooseFile(file);
					event.target.value = "";
				}}
			/>
			{avatarError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{avatarError}
				</p>
			) : message && !nameError ? (
				<p role="status" className="text-caption text-[var(--color-text-tertiary)]">
					{message}
				</p>
			) : null}
		</div>
	);
}
