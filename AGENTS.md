# Nutrition Project

## Business Requirements

- A user can sign in
- New users will register with a telegram id and an email
- When signed in the user can only see their information
- An MVP of a Nutrition Tracker application as a web app  
- The web app should be able to log daily meals
- The meals can be stored as individual foods, such as a cup of rice
- The meals can be stored as meals, for example a typical breakfast
- The system must be able to create, read, update and delete a food.
- The system must be able to create, read, update and delete a meal.
- The system must be able to track days over time, and should be able to dig into a day.
- Tracking days means a history of days to move between and open. It does not mean an archive screen, saved views, or any filter over that history - which is all that "no archive" below forbids.
- Each day is summarised against a calorie and macronutrient target: 2,200 kcal, 140 g protein, 250 g carbohydrate, 70 g fat. Those are the values the app ships with, held in one place (`frontend/lib/targets.ts`) rather than fixed rules of the product.
- A food or a meal that is still in use must not be silently removed. The delete is refused and the app says where the record is referenced: which meals use the food, which days log either one. Nothing cascades.
- No more functionality: no archive, no search/filter. Keep it simple.
- The priority is a slick, professional, gorgeous UI/UX with very simple features
- The app should open with dummy data populated for a few sample days, so the history is visible from the first screen

## Limitations

For the MVP, there will only be a user sign in (hardcoded to 'user' and 'password') but the database will support multiple users for future.
For the MVP, there will only be 1 Nutrition Tracker for the signed in user.
For the MVP, this will run locally (in a docker container)

## Technical Details

- Implemented as a modern NextJS app, client rendered
- The NextJS app should be created in a subdirectory `frontend`
- The frontend is in-memory only until Part 7: it is seeded on load and keeps nothing across a reload. Persistence arrives with the backend - schema (Part 5), API (Part 6), and the frontend using it (Part 7).
- No user-management UI for the MVP: sign-in is hardcoded, and the schema carries a user id so multiple users work later.
- Use popular libraries
- Use Bootstrap
- As simple as possible but with an elegant UI
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- AI is out of scope for this MVP: no OpenRouter call, no API key.
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point
A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

Dark, dense, sharp-cornered. Bootstrap runs in its own dark theme (`data-bs-theme="dark"` on `<html>`), and the palette below is defined once as CSS custom properties in `frontend/app/globals.css` and bridged into Bootstrap's `--bs-*` variables. No component hardcodes a colour value.

- Accent Volt: `#c8ff4d` - accent lines, highlights, active states
- Blue Primary: `#38d9f5` - links, key actions
- Violet Secondary: `#9b7bff` - submit buttons, important actions
- Near Black Ink: `#0a0d12` - the page base and the text on any solid accent fill
- Gray Text: `#8b95a7` - supporting text, labels
- Ember: `#ff6b4a` - the one status colour: a day over its calorie target

Surface tokens:

- Ink `#0a0d12` - page background
- Surface `#12161f` - cards, panels, list rows, dialog
- Surface raised `#1a202b` - inputs, hover and active row fills
- Hairline `#384355` - borders and dividers, chosen so a line reads against every surface (1.6:1 or better) without shouting

Where each colour goes:

- **Ink** is the page itself, and the text colour inside any solid fill - a volt or cyan button carries ink text, never white.
- **Volt** marks the live figure or the live control: the calorie ring arc and the day total, the "Today" label, the active view tab, the selected day chip's border, the logo mark, and the strips and header wash for Breakfast and Snacks.
- **Cyan** carries links and key actions: the add-food button (fills cyan on hover), the meal chevron, the list of foods inside a meal, the selected row in a picker, focus rings, and the strip and header wash for Lunch.
- **Violet** is the commit action: the add-meal button and the confirm button in every dialog, plus the strip and header wash for Dinner.
- **Gray Text** carries quantities, per-entry macro summaries and supporting copy.
- **Ember** appears once, on the over-target figure.
- Macro bars are fixed by nutrient: protein cyan, carbs volt, fat violet, over a raised track.

Contrast rule, measured rather than eyeballed: every text and surface pair in the app is at least 4.5:1, the AA threshold for body text - text `#eaf0f7` is 16.9:1 on ink and 15.8:1 on a card, gray `#8b95a7` is 6.4:1 and 6.0:1, volt 16.6:1, cyan 11.5:1, violet 6.2:1. Two consequences worth stating, because they are easy to undo: white text on the violet commit button would be 2.7:1 and therefore fails, so solid violet carries ink text; and a solid accent fill always takes ink text rather than a lighter one.

## Strategy

1. Write plan with success criteria for each phase to be checked off. Include project scaffolding, including .gitignore, and rigorous unit testing.
2. Execute the plan ensuring all critiera are met
3. Carry out extensive integration testing with Playwright or similar, fixing defects
4. Only complete when the MVP is finished and tested, with the server running and ready for the user

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. Use PEP 8

## Working documentation
All documents for planning and executing this project will be in the docs/ directory. Please review the docs/PLAN.md document before proceeding.

   
