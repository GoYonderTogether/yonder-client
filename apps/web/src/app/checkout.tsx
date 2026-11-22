import type { BillingProduct, BillingProvider, CheckoutOrder } from "@yonder/protocol";
import { BrandedQrCode, Button, FormSection, ListGroup, ListRow } from "@yonder/ui-components";
import { useBillingActions, useBillingCatalog } from "@yonder/ui-data";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openCommerceUrl, supportsCommerce, trustedCommerceUrl } from "../lib/commerce-url.ts";
import { useCommerceRequest } from "../lib/use-commerce-request.ts";
import { CommerceDialog } from "./commerce-dialog.tsx";

function usableProduct(product: BillingProduct) {
	return (
		product.id &&
		product.title &&
		product.currency === "CNY" &&
		Number.isSafeInteger(product.amountMinor) &&
		product.amountMinor > 0 &&
		Array.isArray(product.providers) &&
		product.providers.some((provider) => provider === "wechat" || provider === "alipay")
	);
}

export function CheckoutEntry() {
	const { t } = useTranslation();
	const products = useBillingCatalog(supportsCommerce())?.filter(usableProduct);
	const [open, setOpen] = useState(false);
	if (!products?.length) return null;
	return (
		<>
			<ListGroup>
				<ListRow title={t("commerce.billing.buy")} onClick={() => setOpen(true)} chevron />
			</ListGroup>
			{open ? <Checkout products={products} onClose={() => setOpen(false)} /> : null}
		</>
	);
}

type Phase = "creating" | "createFailed" | "pending" | "confirming" | "paid" | "expired" | "failed" | "checkFailed";

function Checkout({ products, onClose }: { products: BillingProduct[]; onClose: () => void }) {
	const { t, i18n } = useTranslation();
	const { create, read, refreshQuota } = useBillingActions();
	const { run } = useCommerceRequest();
	const [product, setProduct] = useState<BillingProduct>();
	const [order, setOrder] = useState<CheckoutOrder>();
	const [phase, setPhase] = useState<Phase>();
	const [opening, setOpening] = useState(false);
	const [openFailed, setOpenFailed] = useState(false);

	function price(item: BillingProduct) {
		return new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
			style: "currency",
			currency: item.currency,
		}).format(item.amountMinor / 100);
	}

	function watch(id: string) {
		run(
			(signal) => read(id, signal),
			(result) => {
				if (result.id !== id) throw new Error("Unexpected checkout order");
				switch (result.status) {
					case "pending": {
						const expiresAt = Date.parse(result.expiresAt);
						if (!Number.isFinite(expiresAt)) throw new Error("Invalid checkout expiry");
						const elapsed = expiresAt <= Date.now();
						setOrder((current) => current && { ...current, expiresAt: result.expiresAt });
						setPhase(elapsed ? "confirming" : "pending");
						return elapsed ? 5000 : 2000;
					}
					case "paid":
						void refreshQuota();
						break;
					case "expired":
					case "failed":
						break;
					default:
						throw new Error("Unexpected checkout status");
				}
				setPhase(result.status);
			},
			() => setPhase("checkFailed"),
		);
	}

	function place(item: BillingProduct, provider: BillingProvider) {
		setProduct(item);
		setPhase("creating");
		setOpenFailed(false);
		run(
			(signal) => create(item.id, provider, signal),
			(result) => {
				const url =
					provider === "wechat" && result.action?.type === "qr"
						? trustedCommerceUrl("wechat-pay", result.action.url)
						: provider === "alipay" && result.action?.type === "redirect"
							? trustedCommerceUrl("alipay", result.action.url)
							: undefined;
				const expiresAt = Date.parse(result.expiresAt);
				if (!url || !result.id || result.status !== "pending" || !Number.isFinite(expiresAt)) {
					throw new Error("Invalid checkout order");
				}
				setOrder({ ...result, action: { ...result.action, url } });
				setPhase(expiresAt <= Date.now() ? "confirming" : "pending");
				watch(result.id);
			},
			() => setPhase("createFailed"),
		);
	}

	async function openPayment(order: CheckoutOrder) {
		setOpenFailed(false);
		if (Date.parse(order.expiresAt) <= Date.now()) {
			setPhase("confirming");
			watch(order.id);
			return;
		}
		setOpening(true);
		try {
			await openCommerceUrl(order.action.url, "alipay");
		} catch {
			setOpenFailed(true);
		} finally {
			setOpening(false);
		}
	}

	const choosing = !phase || phase === "createFailed" || phase === "failed" || phase === "expired";
	const activeOrder = phase === "pending" && order && Date.parse(order.expiresAt) > Date.now() ? order : null;
	return (
		<CommerceDialog open onClose={onClose} title={t("commerce.billing.buy")}>
			{phase && (phase !== "pending" || !activeOrder || activeOrder.action.type !== "qr") ? (
				<p role={phase === "createFailed" || phase === "checkFailed" || phase === "failed" ? "alert" : "status"}>
					{t(`commerce.billing.${phase === "pending" && !activeOrder ? "confirming" : phase}`)}
				</p>
			) : null}
			{choosing ? (
				products.map((item) => (
					<FormSection key={item.id} title={item.title}>
						<span className="text-h3 tabular-nums">{price(item)}</span>
						<div className="flex flex-wrap gap-[var(--spacing-2)]">
							{item.providers.includes("wechat") ? (
								<Button onClick={() => place(item, "wechat")}>{t("commerce.billing.wechat")}</Button>
							) : null}
							{item.providers.includes("alipay") ? (
								<Button onClick={() => place(item, "alipay")}>{t("commerce.billing.alipay")}</Button>
							) : null}
						</div>
					</FormSection>
				))
			) : product ? (
				<FormSection title={product.title}>
					<span className="text-h3 tabular-nums">{price(product)}</span>
					{activeOrder?.action.type === "qr" ? (
						<>
							<BrandedQrCode value={activeOrder.action.url} label={t("commerce.billing.scanWechat")} />
							<p role="status">{t("commerce.billing.scanWechat")}</p>
						</>
					) : null}
					{activeOrder?.action.type === "redirect" ? (
						<Button
							variant="primary"
							loading={opening}
							className="self-start"
							onClick={() => void openPayment(activeOrder)}
						>
							<ExternalLink size={16} aria-hidden="true" />
							{t("commerce.billing.openAlipay")}
						</Button>
					) : null}
					{openFailed && activeOrder ? <p role="alert">{t("commerce.billing.openFailed")}</p> : null}
					{phase === "checkFailed" && order ? (
						<Button onClick={() => watch(order.id)} className="self-start">
							{t("commerce.checkAgain")}
						</Button>
					) : null}
				</FormSection>
			) : null}
		</CommerceDialog>
	);
}
