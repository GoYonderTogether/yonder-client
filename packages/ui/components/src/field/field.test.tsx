// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { CodeField } from "./code-field.tsx";
import { Field } from "./field.tsx";
import { PasswordField } from "./password-field.tsx";
import { PhoneField } from "./phone-field.tsx";
import { SearchInput } from "./search-input.tsx";
import { SelectField } from "./select-field.tsx";

function PhoneForm() {
	const [country, setCountry] = useState("+86");
	const [phone, setPhone] = useState("");
	return (
		<Field label="Phone" htmlFor="phone">
			<PhoneField
				id="phone"
				countryLabel="Country code"
				countryCode={country}
				onCountryCodeChange={setCountry}
				countries={[
					{ code: "+86", label: "China +86" },
					{ code: "+65", label: "Singapore +65" },
				]}
				value={phone}
				onChange={(event) => setPhone(event.target.value)}
			/>
		</Field>
	);
}

function CodeForm({ onComplete }: { onComplete: (value: string) => void }) {
	const [value, setValue] = useState("");
	return <CodeField value={value} onChange={setValue} onComplete={onComplete} label="Code" />;
}

test("PhoneField selects a country with the keyboard and accepts a number", async () => {
	const user = userEvent.setup();
	render(<PhoneForm />);
	const trigger = screen.getByRole("button", { name: /Country code/ });
	await user.click(trigger);
	const china = screen.getByRole("option", { name: "China +86" });
	expect(china).toHaveFocus();
	await user.keyboard("{ArrowDown}");
	expect(screen.getByRole("option", { name: "Singapore +65" })).toHaveFocus();
	await user.keyboard("{Enter}");
	expect(trigger).toHaveFocus();
	expect(trigger).toHaveAccessibleName("Country code: Singapore +65");
	await user.type(screen.getByRole("textbox", { name: "Phone" }), "12345678");
	expect(screen.getByRole("textbox", { name: "Phone" })).toHaveValue("12345678");
	await user.click(trigger);
	await user.keyboard("{Escape}");
	expect(trigger).toHaveFocus();
	expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	await user.click(trigger);
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("CodeField pastes six digits into one autofill input", async () => {
	const user = userEvent.setup();
	const complete = vi.fn();
	const { container } = render(<CodeForm onComplete={complete} />);
	const code = screen.getByRole("textbox", { name: "Code" });
	expect(code).toHaveAttribute("autocomplete", "one-time-code");
	await user.click(code);
	await user.paste("12 34 56");
	expect(code).toHaveValue("123456");
	expect(container.querySelectorAll("input")).toHaveLength(1);
	const cells = container.querySelector('[aria-hidden="true"]');
	expect(cells?.textContent).toBe("123456");
	expect(complete).toHaveBeenCalledExactlyOnceWith("123456");
});

test("PasswordField toggles visibility without losing the value", async () => {
	const user = userEvent.setup();
	render(
		<Field label="Password" htmlFor="password">
			<PasswordField id="password" showLabel="Show password" hideLabel="Hide password" defaultValue="secret" />
		</Field>,
	);
	const input = screen.getByLabelText("Password");
	expect(input).toHaveAttribute("type", "password");
	await user.click(input);
	await user.click(screen.getByRole("button", { name: "Show password" }));
	expect(input).toHaveAttribute("type", "text");
	expect(input).toHaveValue("secret");
	expect(input).toHaveFocus();
	await user.tab();
	expect(screen.getByRole("button", { name: "Hide password" })).toHaveFocus();
	await user.keyboard(" ");
	expect(input).toHaveAttribute("type", "password");
});

test("SelectField shares picker keyboard behaviour and error association", async () => {
	const user = userEvent.setup();
	const change = vi.fn();
	render(
		<SelectField
			label="Language"
			value="en"
			onChange={change}
			error="Required"
			options={[
				{ value: "en", label: "English" },
				{ value: "zh", label: "中文" },
			]}
		/>,
	);
	const trigger = screen.getByRole("button", { name: /Language/ });
	expect(trigger).toHaveAccessibleDescription("Required");
	await user.click(trigger);
	const list = screen.getByRole("listbox", { name: "Language" });
	expect(within(list).getByRole("option", { name: "English" })).toHaveFocus();
	await user.keyboard("{End}{Enter}");
	expect(change).toHaveBeenCalledWith("zh");
	expect(trigger).toHaveFocus();
});

test("SearchInput places its decorative icon before a named native search field and forwards input props", async () => {
	const change = vi.fn();
	const view = render(<SearchInput placeholder="Search contacts" name="q" maxLength={40} onChange={change} />);
	const search = screen.getByRole("searchbox", { name: "Search contacts" });
	expect(search).toHaveAttribute("placeholder", "Search contacts");
	expect(search).toHaveAttribute("name", "q");
	expect(search).toHaveAttribute("maxlength", "40");
	expect(search.previousElementSibling).toHaveClass("lucide-search");
	expect(search.previousElementSibling).toHaveAttribute("aria-hidden", "true");
	expect(search.nextElementSibling).toBeNull();
	await userEvent.type(search, "Ada");
	expect(search).toHaveValue("Ada");
	expect(change).toHaveBeenCalled();
	view.rerender(<SearchInput placeholder="Search contacts" aria-label="Find a person" disabled />);
	expect(screen.getByRole("searchbox", { name: "Find a person" })).toBeDisabled();
});

test("a long selected label keeps its full accessible name and complete selectable options", async () => {
	const user = userEvent.setup();
	const label = "Windows PC · Windows · 2026/11/16 01:23:45 · Work computer in the design studio";
	const change = vi.fn();
	render(
		<SelectField
			label="Device"
			value="device-a"
			options={[
				{ value: "device-a", label },
				{ value: "device-b", label: `${label} B` },
			]}
			onChange={change}
		/>,
	);
	const trigger = screen.getByRole("button", { name: `Device: ${label}` });
	await user.click(trigger);
	expect(screen.getByRole("option", { name: label })).toHaveFocus();
	await user.click(screen.getByRole("option", { name: `${label} B` }));
	expect(change).toHaveBeenCalledWith("device-b");
	expect(trigger).toHaveFocus();
});
