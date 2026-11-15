# @yonder/feature-me

The 「我」 overlay — layer three of the shell.

## What it holds

| section           | state                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| profile (top)     | avatar and name, editable in place, optimistic                                    |
| 账号与安全        | phone (masked), password set/not set, signed-in devices, sign out, delete account |
| 额度 / 邀请和分享 | actual quota ledger and invitation data                                           |
| 模型              | user providers, key replacement, model discovery and connection test              |
| 设备              | empty state                                                                       |
| 通用              | language (中文 / English) and appearance (system / light / dark)                  |
| 关于              | version, server version, and the two legal documents, not built yet               |

## Rules it follows

- **No fake data.** Sections without data show a short empty state.
- **Model supply** follows 架构-07 供应、调度 and `11-布局和页面层级.md` 第六节. Keys are write-only:
  the list never receives them, and save and discovery do not retain them in the mutation cache.
- **Deleting an account really works.** It asks the user to type their handle, then schedules
  deletion thirty days out and signs every device out.
- **A change shows instantly and reaches other tabs.** Name and avatar go through the query cache;
  the server pushes `member.updated` to the account's other sockets.
- **Desktop and phone are one component.** Settings are beside the list on wide screens and pushed
  as pages on narrow screens.

## What it does not do

- It does not own the change-password screen: the app passes it in, because the form belongs to the
  auth feature and features never import each other.
