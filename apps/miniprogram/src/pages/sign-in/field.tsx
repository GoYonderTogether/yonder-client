import { Input, Text, View } from "@tarojs/components";

export function Field({
	label,
	value,
	onInput,
	placeholder,
	password,
}: {
	label: string;
	value: string;
	onInput: (value: string) => void;
	placeholder?: string;
	password?: boolean;
}) {
	return (
		<View>
			<Text className="mini-auth-label">{label}</Text>
			<Input
				className="auth-control mini-auth-input"
				value={value}
				password={password}
				placeholder={placeholder}
				onInput={(event) => onInput(event.detail.value)}
			/>
		</View>
	);
}
