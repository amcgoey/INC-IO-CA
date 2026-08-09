/**
 * @file CardSerializer.ts
 * @description Compiles CardService builder outputs into normalized JSON output trees.
 */

import {
  MockCard,
  MockCardBuilder,
  MockCardHeader,
  MockCardSection,
  MockTextParagraph,
  MockButtonSet,
  MockTextButton,
  MockImageButton,
  MockTextInput,
  MockSelectionInput,
  MockDatePicker,
  MockAction,
  MockOpenLink,
  MockActionResponse,
  MockActionResponseBuilder
} from "./CardServiceMocks";

export interface OpenLinkJson {
  url?: string;
  openAs?: string;
  onClose?: string;
}

export interface ActionJson {
  functionName?: string;
  parameters: Record<string, string>;
  loadIndicator?: string;
}

export interface TextButtonJson {
  type: "TextButton";
  text?: string;
  style?: string;
  disabled: boolean;
  openLink?: OpenLinkJson;
  onClickAction?: ActionJson;
}

export interface ImageButtonJson {
  type: "ImageButton";
  icon?: string;
  iconUrl?: string;
  altText?: string;
  openLink?: OpenLinkJson;
  onClickAction?: ActionJson;
}

export type ButtonJson = TextButtonJson | ImageButtonJson;

export interface TextParagraphWidgetJson {
  type: "TextParagraph";
  text?: string;
}

export interface ButtonSetWidgetJson {
  type: "ButtonSet";
  buttons: ButtonJson[];
}

export interface TextInputWidgetJson {
  type: "TextInput";
  fieldName?: string;
  title?: string;
  value?: string;
  multiline: boolean;
  suggestions?: string[];
  onChangeAction?: ActionJson;
}

export interface SelectionItemJson {
  text: string;
  value: string;
  selected: boolean;
}


export interface DatePickerWidgetJson {
  type: "DatePicker";
  fieldName?: string;
  title?: string;
  valueInMsSinceEpoch?: number;
  hint?: string;
  onChangeAction?: ActionJson;
}

export interface SelectionInputWidgetJson {
  type: "SelectionInput";
  inputType?: string;
  fieldName?: string;
  title?: string;
  items: SelectionItemJson[];
  onChangeAction?: ActionJson;
}

export type WidgetJson =
  | TextParagraphWidgetJson
  | ButtonSetWidgetJson
  | TextInputWidgetJson
  | SelectionInputWidgetJson
  | DatePickerWidgetJson
  | { type: string; [key: string]: unknown };

export interface SectionJson {
  header?: string;
  collapsible: boolean;
  numUncollapsibleWidgets?: number;
  widgets: WidgetJson[];
}

export interface CardHeaderJson {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  imageStyle?: string;
  imageCornerStyle?: string;
}

export interface CardJson {
  name?: string;
  header?: CardHeaderJson;
  sections: SectionJson[];
}

export interface NotificationJson {
  text?: string;
}

export interface NavigationJson {
  action?: string;
  card?: CardJson;
}

export interface ActionResponseJson {
  stateChanged?: boolean;
  notification?: NotificationJson;
  navigation?: NavigationJson;
}

export class CardSerializer {
  private static serializeOpenLink(link?: MockOpenLink): OpenLinkJson | undefined {
    if (!link) return undefined;
    return {
      url: link.url,
      openAs: link.openAs,
      onClose: link.onClose
    };
  }

  private static serializeAction(action?: MockAction): ActionJson | undefined {
    if (!action) return undefined;
    return {
      functionName: action.functionName,
      parameters: action.parameters || {},
      loadIndicator: action.loadIndicator
    };
  }

  private static serializeWidget(widget: any): WidgetJson {
    if (widget && (widget.topLabel !== undefined || (widget.content !== undefined && widget.bottomLabel !== undefined))) {
      return {
        type: "KeyValue",
        topLabel: widget.topLabel,
        content: widget.content,
        bottomLabel: widget.bottomLabel
      };
    }

    if (widget instanceof MockTextParagraph || (widget?.text !== undefined && typeof widget?.setText === "function")) {
      return {
        type: "TextParagraph",
        text: widget.text
      };
    }

    if (widget instanceof MockButtonSet || Array.isArray(widget?.buttons)) {
      const buttons: ButtonJson[] = (widget.buttons || []).map((btn: any) => {
        if (btn instanceof MockImageButton || btn?.icon !== undefined || btn?.iconUrl !== undefined) {
          return {
            type: "ImageButton",
            icon: btn.icon,
            iconUrl: btn.iconUrl,
            altText: btn.altText,
            openLink: CardSerializer.serializeOpenLink(btn.openLink),
            onClickAction: CardSerializer.serializeAction(btn.onClickAction)
          };
        }
        return {
          type: "TextButton",
          text: btn.text,
          style: btn.style,
          disabled: Boolean(btn.disabled),
          openLink: CardSerializer.serializeOpenLink(btn.openLink),
          onClickAction: CardSerializer.serializeAction(btn.onClickAction)
        };
      });
      return {
        type: "ButtonSet",
        buttons
      };
    }

    if (widget instanceof MockDatePicker || (widget?.setFieldName && widget?.setValueInMsSinceEpoch)) {
      return {
        type: "DatePicker",
        fieldName: widget.fieldName,
        title: widget.title,
        valueInMsSinceEpoch: widget.valueInMsSinceEpoch,
        ...(widget.hint !== undefined ? { hint: widget.hint } : {}),
        onChangeAction: CardSerializer.serializeAction(widget.onChangeAction)
      };
    }

    if (widget instanceof MockTextInput || (widget?.setFieldName && widget?.setValue && !widget?.items)) {
      return {
        type: "TextInput",
        fieldName: widget.fieldName,
        title: widget.title,
        value: widget.value,
            ...(widget.hint !== undefined ? { hint: widget.hint } : {}),
        multiline: Boolean(widget.multiline),
        suggestions: widget.suggestions?.suggestions,
        onChangeAction: CardSerializer.serializeAction(widget.onChangeAction)
      };
    }

    if (widget instanceof MockSelectionInput || (widget?.items && widget?.setFieldName)) {
      return {
        type: "SelectionInput",
        inputType: widget.type,
        fieldName: widget.fieldName,
        title: widget.title,
        items: (widget.items || []).map((item: any) => ({
          text: item.text,
          value: item.value,
          selected: Boolean(item.selected)
        })),
        onChangeAction: CardSerializer.serializeAction(widget.onChangeAction)
      };
    }

    return {
      type: widget?.constructor?.name || "UnknownWidget",
      ...widget
    };
  }

  public static toJSON(cardInput: MockCard | MockCardBuilder | CardJson | any): CardJson {
    if (cardInput && !(cardInput instanceof MockCard) && !(cardInput instanceof MockCardBuilder) && typeof cardInput === "object" && Array.isArray(cardInput.sections)) {
      return cardInput as CardJson;
    }
    const card: MockCard = cardInput instanceof MockCardBuilder ? cardInput.build() : cardInput;

    const headerJson: CardHeaderJson | undefined = card?.header
      ? {
          title: card.header.title,
          subtitle: card.header.subtitle,
          imageUrl: card.header.imageUrl,
          imageStyle: card.header.imageStyle,
          imageCornerStyle: card.header.imageCornerStyle
        }
      : undefined;

    const sectionsJson: SectionJson[] = (card?.sections || []).map((sec: any) => {
      const widgets = (sec?.widgets || []).map((w: any) => CardSerializer.serializeWidget(w));
      return {
        header: sec.header,
        collapsible: Boolean(sec.collapsible),
        numUncollapsibleWidgets: sec.numUncollapsibleWidgets,
        widgets
      };
    });

    return {
      name: card?.name,
      header: headerJson,
      sections: sectionsJson
    };
  }

  public static actionResponseToJSON(responseInput: MockActionResponse | MockActionResponseBuilder | ActionResponseJson | any): ActionResponseJson {
    if (responseInput && !(responseInput instanceof MockActionResponse) && !(responseInput instanceof MockActionResponseBuilder) && typeof responseInput === "object" && ("stateChanged" in responseInput || "notification" in responseInput || "navigation" in responseInput)) {
      return responseInput as ActionResponseJson;
    }
    const res: MockActionResponse = responseInput instanceof MockActionResponseBuilder ? responseInput.build() : responseInput;

    const notifJson: NotificationJson | undefined = res?.notification
      ? { text: typeof res.notification.getText === "function" ? res.notification.getText() : (res.notification as any).text }
      : undefined;

    let navJson: NavigationJson | undefined;
    if (res?.navigation?.actionResponse) {
      const act = res.navigation.actionResponse;
      navJson = {
        action: act.action,
        card: act.card ? CardSerializer.toJSON(act.card) : undefined
      };
    }

    return {
      stateChanged: res?.stateChanged,
      notification: notifJson,
      navigation: navJson
    };
  }
  public static hasWidgetText(cardInput: CardJson | MockCard | MockCardBuilder | unknown, searchString: string): boolean {
    if (!cardInput) return false;
    const cardJson = CardSerializer.toJSON(cardInput);

    const matchText = (val: unknown): boolean => {
      if (typeof val === "string") {
        return val.includes(searchString);
      }
      if (Array.isArray(val)) {
        return val.some(matchText);
      }
      if (val && typeof val === "object") {
        return Object.values(val).some(matchText);
      }
      return false;
    };

    return matchText(cardJson);
  }

  public static findButton(cardInput: CardJson | MockCard | MockCardBuilder | unknown, buttonIdentifier: string): ButtonJson | undefined {
    if (!cardInput) return undefined;
    const cardJson = CardSerializer.toJSON(cardInput);

    const checkButton = (btn: ButtonJson): boolean => {
      if (btn.type === "TextButton" && btn.text === buttonIdentifier) {
        return true;
      }
      if (btn.type === "ImageButton" && btn.altText === buttonIdentifier) {
        return true;
      }
      if (btn.onClickAction && btn.onClickAction.functionName === buttonIdentifier) {
        return true;
      }
      return false;
    };

    for (const sec of cardJson.sections || []) {
      for (const widget of sec.widgets || []) {
        if (!widget) continue;
        if (widget.type === "ButtonSet") {
          const btnSet = widget as ButtonSetWidgetJson;
          for (const btn of btnSet.buttons || []) {
            if (checkButton(btn)) return btn;
          }
        } else if (widget.type === "TextButton" || widget.type === "ImageButton") {
          const btn = widget as ButtonJson;
          if (checkButton(btn)) return btn;
        }
      }
    }
    return undefined;
  }

  public static getNotificationText(responseInput: ActionResponseJson | MockActionResponse | MockActionResponseBuilder | unknown): string | null {
    if (!responseInput) return null;
    const responseJson = CardSerializer.actionResponseToJSON(responseInput);
    return responseJson?.notification?.text ?? null;
  }
}
