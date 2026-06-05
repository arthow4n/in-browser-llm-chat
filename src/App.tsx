import { Theme, Header, HeaderName, HeaderGlobalBar, Content } from "@carbon/react";

export default function App() {
  return (
    <Theme theme="g100">
      <Header aria-label="LLM Chat">
        <HeaderName href="#" prefix="LLM">
          Chat
        </HeaderName>
        <HeaderGlobalBar>{/* Settings and other global actions will go here */}</HeaderGlobalBar>
      </Header>
      <Content>
        <main>
          <h1>Welcome to LLM Chat</h1>
          <p>This is the basic Carbon layout shell.</p>
        </main>
      </Content>
    </Theme>
  );
}
