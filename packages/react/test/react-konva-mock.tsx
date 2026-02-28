import { createElement, type PropsWithChildren } from "react";

const wrapProps = (props: Record<string, unknown>) => {
  const nextProps: Record<string, unknown> = {};

  if (typeof props.className === "string") {
    nextProps.className = props.className;
  }

  if (typeof props.style === "object" && props.style !== null) {
    nextProps.style = props.style;
  }

  if (typeof props["data-testid"] === "string") {
    nextProps["data-testid"] = props["data-testid"];
  }

  if (typeof props.onMouseDown === "function") {
    nextProps.onMouseDown = () =>
      (
        props.onMouseDown as (event: {
          evt: {
            preventDefault(): void;
          };
          target: {
            getStage(): {
              getPointerPosition(): { x: number; y: number };
            };
          };
        }) => void
      )({
        evt: {
          preventDefault() {}
        },
        target: {
          getStage() {
            return {
              getPointerPosition() {
                return { x: 0, y: 0 };
              }
            };
          }
        }
      });
  }

  if (typeof props.onTap === "function") {
    nextProps.onClick = () =>
      (
        props.onTap as (event: {
          evt: {
            preventDefault(): void;
          };
          target: {
            getStage(): {
              getPointerPosition(): { x: number; y: number };
            };
          };
        }) => void
      )({
        evt: {
          preventDefault() {}
        },
        target: {
          getStage() {
            return {
              getPointerPosition() {
                return { x: 0, y: 0 };
              }
            };
          }
        }
      });
  }

  return nextProps;
};

const createPrimitive = (tag: keyof HTMLElementTagNameMap) =>
  function Primitive({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) {
    return createElement(tag, wrapProps(props), children);
  };

export const Stage = createPrimitive("div");
export const Layer = createPrimitive("div");
export const Group = createPrimitive("div");
export const Rect = createPrimitive("div");
export const Text = createPrimitive("div");
