import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./GasMockHarness";
import { CardSerializer } from "./CardSerializer";

test.beforeEach(() => {
  GasMockHarness.install();
});

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("CardService builder methods capture configuration state", () => {
  const CardService = (globalThis as any).CardService;

  const header = CardService.newCardHeader()
    .setTitle("Card Title")
    .setSubtitle("Card Subtitle")
    .setImageUrl("https://example.com/icon.png")
    .setImageStyle(CardService.ImageStyle.CIRCLE);

  const section = CardService.newCardSection()
    .setHeader("Section 1")
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(2)
    .addWidget(CardService.newTextParagraph().setText("Hello World"));

  const action = CardService.newAction()
    .setFunctionName("onSave")
    .setParameters({ id: "123", mode: "edit" });

  const openLink = CardService.newOpenLink()
    .setUrl("https://example.com/doc")
    .setOpenAs(CardService.OpenAs.OVERLAY)
    .setOnClose(CardService.OnClose.RELOAD_ADD_ON);

  const textBtn = CardService.newTextButton()
    .setText("Save")
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setDisabled(false)
    .setOnClickAction(action);

  const linkBtn = CardService.newTextButton()
    .setText("Open Doc")
    .setOpenLink(openLink);

  const buttonSet = CardService.newButtonSet()
    .addButton(textBtn)
    .addButton(linkBtn);

  section.addWidget(buttonSet);

  const suggestions = CardService.newSuggestions().addSuggestions(["Option A", "Option B"]);
  const textInput = CardService.newTextInput()
    .setFieldName("titleField")
    .setTitle("Title")
    .setValue("Default Value")
    .setMultiline(true)
    .setSuggestions(suggestions);

  section.addWidget(textInput);

  const selectionInput = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName("category")
    .setTitle("Category")
    .addItem("Option A", "A", true)
    .addItem("Option B", "B", false);

  section.addWidget(selectionInput);

  const card = CardService.newCardBuilder()
    .setName("TestCard")
    .setHeader(header)
    .addSection(section)
    .build();

  assert.ok(card);
});

test("CardSerializer.toJSON(card) produces normalized JSON representation", () => {
  const CardService = (globalThis as any).CardService;

  const header = CardService.newCardHeader()
    .setTitle("Test Card Title")
    .setSubtitle("Test Card Subtitle")
    .setImageUrl("https://example.com/logo.png");

  const sec1 = CardService.newCardSection()
    .setHeader("General Info")
    .addWidget(CardService.newTextParagraph().setText("Paragraph 1 text"));

  const textInput = CardService.newTextInput()
    .setFieldName("username")
    .setTitle("Username")
    .setValue("john_doe")
    .setSuggestions(CardService.newSuggestions().addSuggestions(["john_doe", "jane_doe"]));

  const dropDown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName("role")
    .setTitle("Role")
    .addItem("Admin", "admin", true)
    .addItem("User", "user", false);

  const saveAction = CardService.newAction()
    .setFunctionName("handleSave")
    .setParameters({ formId: "42" });

  const saveBtn = CardService.newTextButton()
    .setText("Submit")
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(saveAction);

  const sec2 = CardService.newCardSection()
    .setHeader("Form Inputs")
    .addWidget(textInput)
    .addWidget(dropDown)
    .addWidget(CardService.newButtonSet().addButton(saveBtn));

  const card = CardService.newCardBuilder()
    .setName("UserFormCard")
    .setHeader(header)
    .addSection(sec1)
    .addSection(sec2)
    .build();

  const json = CardSerializer.toJSON(card);

  assert.deepEqual(json, {
    name: "UserFormCard",
    header: {
      title: "Test Card Title",
      subtitle: "Test Card Subtitle",
      imageUrl: "https://example.com/logo.png",
      imageStyle: undefined,
      imageCornerStyle: undefined
    },
    sections: [
      {
        header: "General Info",
        collapsible: false,
        numUncollapsibleWidgets: undefined,
        widgets: [
          {
            type: "TextParagraph",
            text: "Paragraph 1 text"
          }
        ]
      },
      {
        header: "Form Inputs",
        collapsible: false,
        numUncollapsibleWidgets: undefined,
        widgets: [
          {
            type: "TextInput",
            fieldName: "username",
            title: "Username",
            value: "john_doe",
            multiline: false,
            suggestions: ["john_doe", "jane_doe"],
            onChangeAction: undefined
          },
          {
            type: "SelectionInput",
            inputType: "DROPDOWN",
            fieldName: "role",
            title: "Role",
            items: [
              { text: "Admin", value: "admin", selected: true },
              { text: "User", value: "user", selected: false }
          ],
            onChangeAction: undefined
          },
          {
            type: "ButtonSet",
            buttons: [
              {
                type: "TextButton",
                text: "Submit",
                style: "FILLED",
                disabled: false,
                openLink: undefined,
                onClickAction: {
                  functionName: "handleSave",
                  parameters: { formId: "42" },
                  loadIndicator: undefined
                }
              }
            ]
          }
        ]
      }
    ]
  });
});

test("CardService.actionResponseToJSON serializes navigation and notification responses", () => {
  const CardService = (globalThis as any).CardService;

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Success"))
    .build();

  const navigation = CardService.newNavigation().pushCard(card);
  const notification = CardService.newNotification().setText("Operation completed successfully");

  const actionResponse = CardService.newActionResponseBuilder()
    .setNavigation(navigation)
    .setNotification(notification)
    .setStateChanged(true)
    .build();

  const json = CardSerializer.actionResponseToJSON(actionResponse);

  assert.deepEqual(json, {
    stateChanged: true,
    notification: {
      text: "Operation completed successfully"
    },
    navigation: {
      action: "pushCard",
      card: {
        name: undefined,
        header: {
          title: "Success",
          subtitle: undefined,
          imageUrl: undefined,
          imageStyle: undefined,
          imageCornerStyle: undefined
        },
        sections: []
      }
    }
  });
});
