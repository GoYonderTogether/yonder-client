# @yonder/feature-members

Members of the chat: people and Bots. One profile skeleton, switched by who the member is and how
they relate to you (design `15-Bot生命周期` and `17-IM页面层级` in the server repo).

The Taro mini program cannot share React DOM components, so it shares the rules and types in
`@yonder/protocol` and builds its own pages.
