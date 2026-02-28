import type { Editor, EditorState } from "@knova/core";
import { useSyncExternalStore } from "react";

export const useEditor = (editor: Editor): EditorState =>
  useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
