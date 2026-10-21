import { Component, type ReactNode } from 'react';

/** Drops the chat if its chunk fails to load (say, after a redeploy), so the page stays up without Ask AI rather than failing whole. */
export class WithoutChatOnError extends Component<Readonly<{ children: ReactNode }>, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
