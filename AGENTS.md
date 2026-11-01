# Nutrition Project

## Business Requirements

- An MVP of a Nutrition Tracker application as a web app  
- The web app should be able to log daily meals
- The meals can be stored as individual foods, such as a cup of rice
- The meals can be stored as meals, for example a typical breakfast
- The system must be able to create, read, update and delete a food.
- The system must be able to create, read, update and delete a meal.
- The system must be able to track days over time, and should be able to dig into a day.
- No more functionality: no archive, no search/filter. Keep it simple.
- The priority is a slick, professional, gorgeous UI/UX with very simple features
- The app should open with dummy data populated for a sample day

## Technical Details

- Implemented as a modern NextJS app, client rendered
- The NextJS app should be created in a subdirectory `frontend`
- No persistence
- No user management for the MVP
- Use popular libraries
- Use Bootstrap
- As simple as possible but with an elegant UI

## Color Scheme

Defined once as Tailwind tokens in `frontend/app/globals.css`; no component hardcodes a hex value.

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

Surface tokens for the light UI:

- Canvas `#f4f6f9` - page background
- Canvas wash `#e7eef8` - a soft gradient across the top of the page
- Hairline `#e6e9ee` - card borders and dividers

Where each colour goes:

- **Dark Navy** is the day summary panel - the one dark surface in the app. White numbers, a yellow label, and an accent-yellow calorie ring with a soft glow. Everything else sits on white cards.
- **Accent Yellow** marks the headline figure of a block: the ring arc, the "Today" label, the over-target number, the logo mark and the sample-day chip. In the section grid it is the top strip and header wash for Breakfast and Snacks.
- **Blue Primary** carries key actions and the expandable: the add-ingredient button (fills solid on hover), the meal chevron, the ingredient breakdown rule, and the strip and header wash for Lunch.
- **Purple Secondary** is the commit action: the add-meal button and the confirm button in every dialog, plus the strip and header wash for Dinner.
- **Gray Text** carries quantities, per-entry macro summaries and supporting copy.
- Macro bars are fixed by nutrient: protein blue, carbs yellow, fat purple - and on the navy panel they run white labels over a white/15 track.

Contrast rule: yellow never carries text on a white or light surface (`#ecad0a` on white is about 1.9:1). It appears as text only on navy, or as a large decorative mark - ring, strip, bar, chip. Section subtotals therefore stay navy on their tinted headers.

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
