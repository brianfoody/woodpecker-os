# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Brief

An AI enhanced web interface for e-Ink display which allows for;

traditional distraction free tasks
summoning knowledge
executing actions

An example would be writing my todo list for the day and having one being to send a slack messge

I write it out by hand, circle it and then draw an arrow to a box with “send to X on slack”

## Background

In the late 1500's Da Vinci wrote an action for later:
"Describe the tongue of a woodpecker"

This struck me as the most magical thing someone can wonder about. While 500 years later we are head down in our phones chasing the latest trend or news story — here was a universal mind wondering about the smallest of life's mysteries.

Since I read that I have slowly started to try and unplug as much as I can . It really illustrated the importance of "boring" time to me. And my mind has (re)started wandering as I force myself to write and sketch every morning.

As a Dad of two, this is what I want for my girls.

Phones are cancerous for our minds. No matter your good intentions, once you pick it up - before you know it you've watched 15 mins of YouTube shorts & your mind is spinning.

"You just need to be more disciplined," some will tell you.

I shouldn't have to be. There is a famous software article titled Falling into the Pit of Success. A quote I love from it is that "a well-designed system makes it easy to do the right things and annoying (but not impossible) to do the wrong things".

And I thought of my last few weeks.

[Notepad] → Curiosity & Calm → Planning → Success
[Phone] → News stories → YouTube → Head spinning → Failure

Is it that simple?

We also live in a world with different expectations than Da Vinci. People pay me to be contactable. Also part of my planning requires me executing some actions. The further I can expand the time I spend in my notepad, the greater the success.

I also find technology quite marvellous. I'd like to be able to summon it when I need. Safely away from the clutching talons of dopamine algorithms as much as possible.

Yes opening the door to technology risks summoning the cancerous addiction. But taking the quote from above it should be annoying (but not impossible) to do the wrong things.

If we don't provide the escape hatch we risk losing to the phone.
We are in competition with the most addictive platform ever created. It needs to feel lovely & magical. The smart phone should feel odd & dated beside it.

You should feel a palpable loss of a calming environment, like walking from a woods onto a busy highway.

And in case you were wondering about that woodpeckers tongue, it really was something worth exploring for Leonardo.

## Proof of Concept

We would like to build out a web interface to plug up to an e-ink display.

The interface will allow for free form sketching but will be upgraded to sense "actions".

An action is a request from the user to take action in the real world.

It can be summoned by pressing a special pen icon (represented by a magic wand icon) and circling a section of the canvas.

All items inside this section of the canvas will be captured and fed into the AI decision maker.

A library already exists which will give us a good foundation for sketching — HDraw.

For our first iteration, let's B integrate it and add our custom "wand" action.

Capture all contents inside the wand highlighted area & feed it into a stub API method.

Make the response as an action prompt with:

title: string

description: string

actions: Array of strings

This should be a returned promise that pops up in the canvas.

## Common Commands

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build production bundle
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

## Architecture

This is a Next.js 15 application using the App Router with TypeScript and React 19. The project is set up with shadcn/ui components and Tailwind CSS v4.

### Key Structure

- `app/` - Next.js App Router pages and layouts
- `lib/` - Shared utilities (includes `cn` utility for className merging)
- `components/` - Reusable React components (configured for shadcn/ui)
- `public/` - Static assets

### Styling & UI

- Uses Tailwind CSS v4 with CSS variables enabled
- shadcn/ui components configured with "new-york" style
- Geist fonts (sans and mono) loaded via next/font
- Lucide React for icons

### Path Aliases

- `@/components` → `components/`
- `@/lib` → `lib/`
- `@/utils` → `lib/utils`
- `@/ui` → `components/ui`
- `@/hooks` → `hooks/`

When adding new components, follow the shadcn/ui patterns and use the configured path aliases.
