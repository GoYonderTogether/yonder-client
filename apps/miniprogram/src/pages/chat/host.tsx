import { View } from "@tarojs/components";
import type { ChatHost } from "@yonder/chat-presentation";

/** Map the shared presentation tree to a native Taro View while keeping events in the page. */
export const ChatView = View as unknown as ChatHost;
