# Skin Architecture v2 (Specification v0.1.5)

To achieve a decoupled and fully customizable UI, the skin system will be expanded to control the structure and properties of UI components, not just visual assets.

## Core Concept: Component Configuration

Instead of just mapping assets, the `skin.json` will define **Components**. Each component in the app (e.g., Header, InputArea, ChatHistory) will look up its configuration from the skin.

### JSON Structure

```json
{
  "metadata": { ... },
  "styles": { ... },
  "assets": { ... },
  "components": {
    "window": {
      "background": "assets/bg.png", // or css class
      "layout": "default" // future proofing
    },
    "header": {
      "visible": true,
      "title": "MY AI AGENT",
      "minimizeButton": { "visible": true, "icon": "assets/min.svg" },
      "closeButton": { "visible": true, "icon": "assets/close.svg" },
      "style": { "backgroundColor": "rgba(0,0,0,0.5)" }
    },
    "input_area": {
      "placeholder": "Enter command...",
      "submitLabel": "SEND",
      "submitIcon": "assets/send.riv",
      "submitButtonStyle": { "backgroundColor": "blue" }
    },
    "history_list": {
      "chatHeader": "CHAT LOG",
      "clipboardHeader": "CLIPBOARD LOG"
    }
  }
}
```

## Customizable Elements

The following UI regions will be exposed for customization:

1.  **Window Frame**: Background, transparency, border radius.
2.  **Header**:
    -   Title (Text, Font, Visibility)
    -   Controls (Minimize, Close - Icons, Hover states via CSS)
3.  **Input Area**:
    -   Text Input (Placeholder text, Styling)
    -   Submit Button (Icon/Text, Position)
    -   Stop Button (Icon/Text)
4.  **Chat History**:
    -   Item Container styling
    -   Markdown rendering styles (via CSS)
    -   Action buttons visibility

## External Editing & Decoupling

-   **Logic vs View**: The React components will handle the *logic* (state, event handlers).
-   **View Injection**: The `SkinContext` will provide a `getComponentConfig(id)` function.
-   **CSS-First**: Layout changes (e.g., button positions, sizes) should primarily be handled via the injected `styles.css`. The JSON defines *content* (text, icons) and *structural options* (visibility, specific behavioral toggles).

## Implementation Strategy

1.  **Typed Config**: extend `SkinDefinition` with a strict schema for component props.
2.  **Generic Wrapper**: Create wrapper components (e.g., `<SkinnedButton id="submit" />`) that handle looking up their own props from the context.
3.  **App Structure**: Refactor `App.tsx` to break down into smaller skinned components (`Header`, `InputArea`, `HistoryList`).
