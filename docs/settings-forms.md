# Settings pages and forms

Every page under 「我」, every chat-settings drawer page and every Bot settings page follows these
rules. They come from Apple's grouped lists (lists and tables, HIG), WeChat's grouped cells
(WeUI `weui-cells`) and the QQ/WeChat settings habits users already have. The shared pieces live in
`@yonder/ui-components` (`ListGroup`, `ListRow`, `ListSwitch`, `ListOption`, `FormSection`) so a
page never draws its own version.

## Page

- The page title lives in the top bar only, centred, with back on the left. The body never repeats it.
- One optional sentence under the top bar says what the page changes, in caption text.
- A page does one job. A setting that belongs to the whole account is not on a single Bot's page.

## Sections

- Content is cut into sections. A section has a title: body-plus size (`text-h3`), semibold,
  primary text colour. A page with one section, and a section holding a lone action (delete, sign
  out), skip the title.
- A solid hairline runs under the title, across the section width.
- Rows inside a section are separated by a dashed line; the last row has none.
- Sections stand at least 32 px apart (a following section adds its own top margin to the column
  gap); rows inside a section have no gap.
- An explanation of the whole section goes in its footer, under the last row, in caption text.

## Rows

| The user wants to        | Row                                                                | Where the result shows                                        |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| open another page        | title, optional current value on the right, chevron                | the next page                                                 |
| turn something on or off | title and a switch (`ListSwitch`); saves at once                   | the switch; a failure puts it back and says why under the row |
| pick one of several      | one row per choice with a check mark (`ListOption`); saves at once | the check mark, then 「已保存」 under the section             |
| see a status             | title and value (`ListValue`), not tappable                        | the value                                                     |
| run an action            | title in accent colour, no chevron                                 | the row's own status or a dialog                              |
| delete or leave          | title in danger colour, alone in the last section                  | a confirmation dialog first                                   |

Checkboxes are for picking several items in a list (members, files), never for a setting.

## Forms (pages that are edited and saved)

- Fields are grouped into sections like rows. A field has its label above it and its hint or error
  under it; the error replaces the hint and stays until the value changes.
- One primary button, 「保存…」, at the end of the form (`FormFooter`): full width in a column under
  640 px, right-aligned in a wider one. It is disabled until something changed. There is no Cancel button: back is cancel, and
  back asks first when there are unsaved changes.
- Saving returns to the previous page; a failed save stays on the form with the draft and the error.

## Confirmations

Destructive or hard-to-undo actions open the shared confirmation dialog: a centred dialog on a
desktop and a page on a phone, with the consequence in one or two sentences and a danger button
named after the action (「删除」, 「解散」). Never an inline card that pushes the page around.

## Layout by width

| Width          | 「我」                                                     | Chat settings                            |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| wide desktop   | directory on the left, one page on the right               | right-hand drawer over the chat          |
| narrow desktop | directory, then pages pushed over it                       | right-hand drawer; pages stack inside it |
| phone          | directory, then pages pushed over it, edge swipe goes back | full-width pages over the chat           |
