export interface ConversationMessage {
  role: "user" | "ai";
  content: string;
  list?: string[];
  codeBlock?: string;
}

export interface ConversationSection {
  messages: ConversationMessage[];
}

export const conversationData: ConversationSection[] = [
  {
    messages: [
      {
        role: "user",
        content: "Let's stash current changes and switch back to main.",
      },
      {
        role: "ai",
        content:
          "I'll stash your current changes and switch to the main branch.",
      },
      {
        role: "ai",
        content: "Done! Here's what happened:",
        list: [
          "Stashed 3 modified files with <code>git stash</code>",
          "Switched to <code>main</code> branch",
          "Branch is up to date with <code>origin/main</code>",
        ],
        codeBlock: `$ git stash
Saved working directory and index state WIP on feature/zustand-state-management

$ git checkout main
Switched to branch 'main'
Your branch is up to date with 'origin/main'.`,
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content: "Actually revert back",
      },
      {
        role: "ai",
        content:
          "Sure! Let me switch back to your previous branch and restore your stashed changes.",
      },
      {
        role: "ai",
        content:
          "You're back on <code>feature/zustand-state-management</code> with all your changes restored.",
        codeBlock: `$ git checkout feature/zustand-state-management
Switched to branch 'feature/zustand-state-management'

$ git stash pop
On branch feature/zustand-state-management
Changes not staged for commit:
  modified:   src/store/index.ts
  modified:   src/components/App.tsx
  modified:   src/hooks/useStore.ts`,
      },
    ],
  },
];
