import { useDidHide, useDidShow } from "@tarojs/taro";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { bootstrapSession, resumeRealtime, suspendRealtime } from "./lib/runtime";
import "./styles/index.scss";

export default function App({ children }: PropsWithChildren) {
	useEffect(() => {
		void bootstrapSession();
	}, []);
	useDidShow(() => {
		void resumeRealtime();
	});
	useDidHide(() => {
		suspendRealtime();
	});
	return children;
}
