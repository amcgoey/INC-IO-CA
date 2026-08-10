
export class MockKeyValue {
  public topLabel?: string;
  public content?: string;
  public bottomLabel?: string;

  public setTopLabel(topLabel: string): this {
    this.topLabel = topLabel;
    return this;
  }

  public setContent(content: string): this {
    this.content = content;
    return this;
  }

  public setBottomLabel(bottomLabel: string): this {
    this.bottomLabel = bottomLabel;
    return this;
  }
}
/**
 * @file CardServiceMocks.ts
 * @description In-memory builder mocks for Google Apps Script CardService UI components.
 */

export const SelectionInputType = {
  DROPDOWN: "DROPDOWN",
  CHECKBOX: "CHECKBOX",
  RADIO_BUTTON: "RADIO_BUTTON",
  MULTI_SELECT: "MULTI_SELECT"
} as const;

export const TextButtonStyle = {
  FILLED: "FILLED",
  OUTLINED: "OUTLINED",
  TEXT: "TEXT"
} as const;

export const OnClose = {
  NOTHING: "NOTHING",
  RELOAD_ADD_ON: "RELOAD_ADD_ON"
} as const;

export const OpenAs = {
  NAVIGATE: "NAVIGATE",
  OVERLAY: "OVERLAY"
} as const;

export const ImageStyle = {
  SQUARE: "SQUARE",
  CIRCLE: "CIRCLE"
} as const;

export class MockCardHeader {
  public title?: string;
  public subtitle?: string;
  public imageUrl?: string;
  public imageStyle?: string;
  public imageCornerStyle?: string;

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public setSubtitle(subtitle: string): this {
    this.subtitle = subtitle;
    return this;
  }

  public setImageUrl(imageUrl: string): this {
    this.imageUrl = imageUrl;
    return this;
  }

  public setImageStyle(imageStyle: string): this {
    this.imageStyle = imageStyle;
    return this;
  }

  public setImageCornerStyle(imageCornerStyle: string): this {
    this.imageCornerStyle = imageCornerStyle;
    return this;
  }
}

export class MockTextParagraph {
  public text?: string;

  public setText(text: string): this {
    this.text = text;
    return this;
  }
}

export class MockOpenLink {
  public url?: string;
  public openAs?: string;
  public onClose?: string;

  public setUrl(url: string): this {
    this.url = url;
    return this;
  }

  public setOpenAs(openAs: string): this {
    this.openAs = openAs;
    return this;
  }

  public setOnClose(onClose: string): this {
    this.onClose = onClose;
    return this;
  }
}

export class MockAction {
  public functionName?: string;
  public parameters: Record<string, string> = {};
  public loadIndicator?: string;

  public setFunctionName(functionName: string): this {
    this.functionName = functionName;
    return this;
  }

  public setParameters(parameters: Record<string, string>): this {
    this.parameters = { ...parameters };
    return this;
  }

  public setLoadIndicator(loadIndicator: string): this {
    this.loadIndicator = loadIndicator;
    return this;
  }
}

export class MockTextButton {
  public text?: string;
  public openLink?: MockOpenLink;
  public onClickAction?: MockAction;
  public style?: string;
  public disabled: boolean = false;

  public setText(text: string): this {
    this.text = text;
    return this;
  }

  public setOpenLink(openLink: MockOpenLink): this {
    this.openLink = openLink;
    return this;
  }

  public setOnClickAction(onClickAction: MockAction): this {
    this.onClickAction = onClickAction;
    return this;
  }

  public setTextButtonStyle(style: string): this {
    this.style = style;
    return this;
  }

  public setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
}

export class MockImageButton {
  public icon?: string;
  public iconUrl?: string;
  public openLink?: MockOpenLink;
  public onClickAction?: MockAction;
  public altText?: string;

  public setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  public setIconUrl(iconUrl: string): this {
    this.iconUrl = iconUrl;
    return this;
  }

  public setOpenLink(openLink: MockOpenLink): this {
    this.openLink = openLink;
    return this;
  }

  public setOnClickAction(onClickAction: MockAction): this {
    this.onClickAction = onClickAction;
    return this;
  }

  public setAltText(altText: string): this {
    this.altText = altText;
    return this;
  }
}

export class MockButtonSet {
  public buttons: Array<MockTextButton | MockImageButton> = [];

  public addButton(button: MockTextButton | MockImageButton): this {
    this.buttons.push(button);
    return this;
  }
}

export class MockSuggestions {
  public suggestions: string[] = [];

  public addSuggestion(suggestion: string): this {
    this.suggestions.push(suggestion);
    return this;
  }

  public addSuggestions(suggestions: string[]): this {
    this.suggestions.push(...suggestions);
    return this;
  }
}

export class MockTextInput {
  public fieldName?: string;
  public title?: string;
  public value?: string;
  public multiline: boolean = false;
  public onChangeAction?: MockAction;
  public suggestions?: MockSuggestions;
  public hint?: string;

  public setHint(hint: string): this {
    this.hint = hint;
    return this;
  }

  public setFieldName(fieldName: string): this {
    this.fieldName = fieldName;
    return this;
  }

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public setValue(value: string): this {
    this.value = value;
    return this;
  }

  public setMultiline(multiline: boolean): this {
    this.multiline = multiline;
    return this;
  }

  public setOnChangeAction(onChangeAction: MockAction): this {
    this.onChangeAction = onChangeAction;
    return this;
  }

  public setSuggestions(suggestions: MockSuggestions): this {
    this.suggestions = suggestions;
    return this;
  }
}

export interface SelectionItem {
  text: string;
  value: string;
  selected: boolean;
}

export class MockSelectionInput {
  public type?: string;
  public fieldName?: string;
  public title?: string;
  public items: SelectionItem[] = [];
  public onChangeAction?: MockAction;

  public setType(type: string): this {
    this.type = type;
    return this;
  }

  public setFieldName(fieldName: string): this {
    this.fieldName = fieldName;
    return this;
  }

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public addItem(text: string, value: string, selected: boolean = false): this {
    this.items.push({ text, value, selected });
    return this;
  }

  public setOnChangeAction(onChangeAction: MockAction): this {
    this.onChangeAction = onChangeAction;
    return this;
  }
}


export class MockDatePicker {
  public fieldName?: string;
  public title?: string;
  public valueInMsSinceEpoch?: number;
  public hint?: string;
  public onChangeAction?: MockAction;

  public setFieldName(fieldName: string): this {
    this.fieldName = fieldName;
    return this;
  }

  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  public setValueInMsSinceEpoch(valueInMsSinceEpoch: number): this {
    this.valueInMsSinceEpoch = valueInMsSinceEpoch;
    return this;
  }

  public setHint(hint: string): this {
    this.hint = hint;
    return this;
  }

  public setOnChangeAction(onChangeAction: MockAction): this {
    this.onChangeAction = onChangeAction;
    return this;
  }
}

export class MockCardSection {
  public header?: string;
  public collapsible: boolean = false;
  public numUncollapsibleWidgets?: number;
  public widgets: Array<MockTextParagraph | MockButtonSet | MockTextInput | MockSelectionInput | any> = [];

  public setHeader(header: string): this {
    this.header = header;
    return this;
  }

  public setCollapsible(collapsible: boolean): this {
    this.collapsible = collapsible;
    return this;
  }

  public setNumUncollapsibleWidgets(n: number): this {
    this.numUncollapsibleWidgets = n;
    return this;
  }

  public addWidget(widget: any): this {
    this.widgets.push(widget);
    return this;
  }
}

export class MockCard {
  public name?: string;
  public header?: MockCardHeader;
  public sections: MockCardSection[] = [];

  constructor(name?: string, header?: MockCardHeader, sections: MockCardSection[] = []) {
    this.name = name;
    this.header = header;
    this.sections = [...sections];
  }
}

export class MockCardBuilder {
  public name?: string;
  public header?: MockCardHeader;
  public sections: MockCardSection[] = [];

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setHeader(header: MockCardHeader): this {
    this.header = header;
    return this;
  }

  public addSection(section: MockCardSection): this {
    this.sections.push(section);
    return this;
  }

  public build(): MockCard {
    return new MockCard(this.name, this.header, this.sections);
  }
}

export class MockNavigation {
  public actionResponse?: { action: string; card?: any };

  /** Direct accessor so tests can read `navigation.card` without CardSerializer. */
  public get card(): any {
    return this.actionResponse?.card;
  }

  /** Direct accessor so tests can read `navigation.action`. */
  public get action(): string | undefined {
    return this.actionResponse?.action;
  }

  public updateCard(card: any): this {
    this.actionResponse = { action: "updateCard", card };
    return this;
  }

  public pushCard(card: any): this {
    this.actionResponse = { action: "pushCard", card };
    return this;
  }

  public popCard(): this {
    this.actionResponse = { action: "popCard" };
    return this;
  }

  public popToRoot(): this {
    this.actionResponse = { action: "popToRoot" };
    return this;
  }
}

export class MockNotification {
  private textVal: string = "";

  public setText(text: string): this {
    this.textVal = text;
    return this;
  }

  public getText(): string {
    return this.textVal;
  }
}

export class MockActionResponse {
  public navigation?: MockNavigation;
  public notification?: MockNotification;
  public stateChanged?: boolean;

  constructor(navigation?: MockNavigation, notification?: MockNotification, stateChanged?: boolean) {
    this.navigation = navigation;
    this.notification = notification;
    this.stateChanged = stateChanged;
  }
}

export class MockActionResponseBuilder {
  public navigation?: MockNavigation;
  public notification?: MockNotification;
  public stateChanged?: boolean;

  public setNavigation(navigation: MockNavigation): this {
    this.navigation = navigation;
    return this;
  }

  public setNotification(notification: MockNotification): this {
    this.notification = notification;
    return this;
  }

  public setStateChanged(stateChanged: boolean): this {
    this.stateChanged = stateChanged;
    return this;
  }

  public build(): MockActionResponse {
    return new MockActionResponse(this.navigation, this.notification, this.stateChanged);
  }
}

export class MockCardService {
  public SelectionInputType = SelectionInputType;
  public TextButtonStyle = TextButtonStyle;
  public OnClose = OnClose;
  public OpenAs = OpenAs;
  public ImageStyle = ImageStyle;

  
  public newKeyValue(): MockKeyValue {
    return new MockKeyValue();
  }

  public newCardBuilder(): MockCardBuilder {
    return new MockCardBuilder();
  }

  public newCardHeader(): MockCardHeader {
    return new MockCardHeader();
  }

  public newCardSection(): MockCardSection {
    return new MockCardSection();
  }

  public newTextParagraph(): MockTextParagraph {
    return new MockTextParagraph();
  }

  public newButtonSet(): MockButtonSet {
    return new MockButtonSet();
  }

  public newTextButton(): MockTextButton {
    return new MockTextButton();
  }

  public newImageButton(): MockImageButton {
    return new MockImageButton();
  }

  public newTextInput(): MockTextInput {
    return new MockTextInput();
  }

  public newSelectionInput(): MockSelectionInput {
    return new MockSelectionInput();
  }

  public newDatePicker(): MockDatePicker {
    return new MockDatePicker();
  }

  public newSuggestions(): MockSuggestions {
    return new MockSuggestions();
  }

  public newAction(): MockAction {
    return new MockAction();
  }

  public newOpenLink(): MockOpenLink {
    return new MockOpenLink();
  }

  public newNavigation(): MockNavigation {
    return new MockNavigation();
  }

  public newNotification(): MockNotification {
    return new MockNotification();
  }

  public newActionResponseBuilder(): MockActionResponseBuilder {
    return new MockActionResponseBuilder();
  }
}
