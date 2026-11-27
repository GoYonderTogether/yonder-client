import { useOptionalSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { FileText } from "lucide-react";
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { MemoryLoading } from "./memory-status.tsx";
import { memoryFileRoute, pathLastSegment } from "./memory-view.ts";

const MemoryFilePage = lazy(() =>
	import("./memory-file.tsx").then(({ MemoryFilePage }) => ({ default: MemoryFilePage })),
);

export { memoryFileRoute };

export function memoryFileDetailKey(path: string) {
	return `memory:${path}`;
}

export function useOpenMemoryFile() {
	const navigate = useNavigate();
	const side = useOptionalSidePanel();
	return (path: string, title?: string) => {
		if (!side) return navigate(memoryFileRoute(path));
		side.open({
			key: memoryFileDetailKey(path),
			title: title || pathLastSegment(path),
			icon: <FileText size={ICON_SIZE.sm} aria-hidden="true" />,
			content: <MemoryFilePane path={path} />,
		});
	};
}

function MemoryFilePane({ path }: { path: string }) {
	const side = useOptionalSidePanel();
	return (
		<div className="p-[var(--spacing-4)]">
			<Suspense fallback={<MemoryLoading />}>
				<MemoryFilePage path={path} inPane onDeleted={() => side?.close()} />
			</Suspense>
		</div>
	);
}
