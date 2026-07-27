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

test("semantic assertion helper hasWidgetText recursively checks widgets for text matches", () => {
  const CardService = (globalThis as any).CardService;

  const header = CardService.newCardHeader()
    .setTitle("Header Title")
    .setSubtitle("Header Subtitle");

  const section = CardService.newCardSection()
    .setHeader("Section Header")
    .addWidget(CardService.newTextParagraph().setText("Paragraph Text"))
    .addWidget(
      CardService.newTextInput()
        .setFieldName("field1")
        .setTitle("Input Title")
        .setValue("Input Value")
    )
    .addWidget(
      CardService.newSelectionInput()
        .setTitle("Selection Title")
        .addItem("Option Label", "opt_val", true)
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton().setText("Submit Action")
      )
    );

  const cardBuilder = CardService.newCardBuilder()
    .setHeader(header)
    .addSection(section);

  const cardJson = CardSerializer.toJSON(cardBuilder);

  // Test with serialized JSON
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Header Title"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Header Subtitle"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Section Header"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Paragraph Text"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Input Title"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Input Value"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Option Label"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Submit Action"), true);

  // Test negative match
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardJson, "Nonexistent Text"), false);

  // Test direct builder input
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardBuilder, "Paragraph Text"), true);
  assert.equal(GasMockHarness.getCardServiceState.hasWidgetText(cardBuilder, "Paragraph Text"), true);
});

test("semantic assertion helper findButton locates buttons by label, altText, or callback action", () => {
  const CardService = (globalThis as any).CardService;

  const saveAction = CardService.newAction().setFunctionName("onSaveHandler");
  const saveBtn = CardService.newTextButton()
    .setText("Save Changes")
    .setOnClickAction(saveAction);

  const imgBtn = CardService.newImageButton()
    .setAltText("Settings Icon")
    .setOnClickAction(CardService.newAction().setFunctionName("openSettings"));

  const section = CardService.newCardSection().addWidget(
    CardService.newButtonSet().addButton(saveBtn).addButton(imgBtn)
  );

  const card = CardService.newCardBuilder().addSection(section).build();

  // Match by text label
  const btnByLabel = GasMockHarness.getCardServiceState.findButton(card, "Save Changes");
  assert.ok(btnByLabel);
  assert.equal(btnByLabel?.type, "TextButton");
  assert.equal((btnByLabel as any)?.text, "Save Changes");

  // Match by callback function name
  const btnByAction = GasMockHarness.getCardServiceState.findButton(card, "onSaveHandler");
  assert.ok(btnByAction);
  assert.equal((btnByAction as any)?.onClickAction?.functionName, "onSaveHandler");

  // Match by altText
  const btnByAlt = GasMockHarness.getCardServiceState.findButton(card, "Settings Icon");
  assert.ok(btnByAlt);
  assert.equal(btnByAlt?.type, "ImageButton");
  assert.equal((btnByAlt as any)?.altText, "Settings Icon");

  // Negative match
  assert.equal(GasMockHarness.getCardServiceState.findButton(card, "Nonexistent"), undefined);
});

test("semantic assertion helper getNotificationText extracts toast notification text", () => {
  const CardService = (globalThis as any).CardService;

  const notification = CardService.newNotification().setText("Saved successfully!");
  const actionResponse = CardService.newActionResponseBuilder()
    .setNotification(notification)
    .build();

  const responseJson = CardSerializer.actionResponseToJSON(actionResponse);

  // From ActionResponseJson
  assert.equal(GasMockHarness.getCardServiceState.getNotificationText(responseJson), "Saved successfully!");

  // From ActionResponse object / builder directly
  assert.equal(GasMockHarness.getCardServiceState.getNotificationText(actionResponse), "Saved successfully!");
  assert.equal(GasMockHarness.getCardServiceState.getNotificationText(actionResponse), "Saved successfully!");

  // Null notification case
  const emptyResponse = CardService.newActionResponseBuilder().build();
  assert.equal(GasMockHarness.getCardServiceState.getNotificationText(emptyResponse), null);
});
