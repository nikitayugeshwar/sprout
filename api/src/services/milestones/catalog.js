/**
 * Developmental milestone catalogue.
 *
 * Content follows the CDC "Learn the Signs. Act Early." checklists (2022
 * revision, Zubler et al., Pediatrics 149(3)). Each checklist item is set at
 * roughly the 75th percentile — i.e. most children can do it by that age — so a
 * missed item at its checkpoint is a conversation to have with a paediatrician
 * rather than a diagnosis. Sprout surfaces it exactly that way.
 *
 * Domains follow the CDC's four categories.
 */

export const DOMAINS = {
  social: { key: 'social', label: 'Social & emotional', blurb: 'How your child connects, plays and responds to people' },
  language: { key: 'language', label: 'Language & communication', blurb: 'Sounds, words, gestures and understanding' },
  cognitive: { key: 'cognitive', label: 'Cognitive', blurb: 'Learning, thinking and problem solving' },
  motor: { key: 'motor', label: 'Movement & physical', blurb: 'Large and fine motor control' },
};

/** Checkpoints, in months, matching the CDC well-visit schedule. */
export const CHECKPOINTS = [2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60];

const RAW = {
  2: {
    social: ['Calms down when spoken to or picked up', 'Looks at your face', 'Seems happy to see you when you walk up', 'Smiles when you talk to or smile at them'],
    language: ['Makes sounds other than crying', 'Reacts to loud sounds'],
    cognitive: ['Watches you as you move', 'Looks at a toy for several seconds'],
    motor: ['Holds head up when on tummy', 'Moves both arms and both legs', 'Opens hands briefly'],
  },
  4: {
    social: ['Smiles on their own to get your attention', 'Chuckles when you try to make them laugh', 'Looks at you, moves, or makes sounds to get or keep your attention'],
    language: ['Makes cooing sounds like "oooo" and "aahh"', 'Makes sounds back when you talk to them', 'Turns head towards the sound of your voice'],
    cognitive: ['Opens mouth when they see the breast or bottle if hungry', 'Looks at their hands with interest'],
    motor: ['Holds head steady without support when you are holding them', 'Holds a toy when you put it in their hand', 'Uses their arm to swing at toys', 'Brings hands to mouth', 'Pushes up onto elbows or forearms when on tummy'],
  },
  6: {
    social: ['Knows familiar people', 'Likes to look at themselves in a mirror', 'Laughs'],
    language: ['Takes turns making sounds with you', 'Blows "raspberries"', 'Makes squealing noises'],
    cognitive: ['Puts things in their mouth to explore them', 'Reaches to grab a toy they want', 'Closes lips to show they do not want more food'],
    motor: ['Rolls from tummy to back', 'Pushes up with straight arms when on tummy', 'Leans on hands to support themselves when sitting'],
  },
  9: {
    social: ['Is shy, clingy, or fearful around strangers', 'Shows several facial expressions', 'Looks when you call their name', 'Reacts when you leave', 'Smiles or laughs when you play peek-a-boo'],
    language: ['Makes different sounds like "mamamama" and "bababababa"', 'Lifts arms up to be picked up'],
    cognitive: ['Looks for objects when they are dropped out of sight', 'Bangs two things together'],
    motor: ['Gets to a sitting position by themselves', 'Moves things from one hand to the other', 'Uses fingers to rake food towards themselves', 'Sits without support'],
  },
  12: {
    social: ['Plays games with you, like pat-a-cake'],
    language: ['Waves bye-bye', 'Calls a parent "mama", "dada" or another special name', 'Understands "no" and pauses briefly'],
    cognitive: ['Puts something in a container', 'Looks for things they see you hide'],
    motor: ['Pulls up to stand', 'Walks holding on to furniture', 'Drinks from a cup without a lid as you hold it', 'Picks things up between thumb and pointer finger'],
  },
  15: {
    social: ['Copies other children while playing', 'Shows you an object they like', 'Claps when excited', 'Hugs a stuffed doll or other toy', 'Shows you affection'],
    language: ['Tries to say one or two words besides "mama" or "dada"', 'Looks at a familiar object when you name it', 'Follows directions given with both a gesture and words', 'Points to ask for something or to get help'],
    cognitive: ['Tries to use things the right way, like a phone, cup or book', 'Stacks at least two small objects'],
    motor: ['Takes a few steps on their own', 'Uses fingers to feed themselves some food'],
  },
  18: {
    social: ['Moves away from you but looks to make sure you are close by', 'Points to show you something interesting', 'Puts hands out for you to wash them', 'Looks at a few pages in a book with you', 'Helps you dress them'],
    language: ['Tries to say three or more words besides "mama" or "dada"', 'Follows one-step directions without any gestures'],
    cognitive: ['Copies you doing chores', 'Plays with toys in a simple way, like pushing a toy car'],
    motor: ['Walks without holding on to anyone', 'Scribbles', 'Drinks from a cup without a lid, though may spill', 'Feeds themselves with fingers', 'Tries to use a spoon', 'Climbs on and off a couch or chair without help'],
  },
  24: {
    social: ['Notices when others are hurt or upset', 'Looks at your face to see how to react in a new situation'],
    language: ['Points to things in a book when you ask', 'Says at least two words together, like "more milk"', 'Points to at least two body parts when you ask', 'Uses more gestures than just waving and pointing'],
    cognitive: ['Holds something in one hand while using the other', 'Tries to use switches, knobs or buttons on a toy', 'Plays with more than one toy at the same time'],
    motor: ['Kicks a ball', 'Runs', 'Walks up a few stairs with or without help', 'Eats with a spoon'],
  },
  30: {
    social: ['Plays next to other children and sometimes plays with them', 'Shows you what they can do, saying "Look at me!"', 'Follows simple routines when told'],
    language: ['Says about 50 words', 'Says two or more words together with one action word', 'Names things in a book when you point and ask', 'Says words like "I", "me" and "we"'],
    cognitive: ['Uses things to pretend, like feeding a block to a doll', 'Shows simple problem-solving skills', 'Follows two-step instructions', 'Shows they know at least one colour'],
    motor: ['Uses hands to twist things, like turning doorknobs', 'Takes some clothes off by themselves', 'Jumps off the ground with both feet', 'Turns book pages one at a time'],
  },
  36: {
    social: ['Calms down within 10 minutes after you leave them', 'Notices other children and joins them to play'],
    language: ['Talks with you in conversation using at least two back-and-forth exchanges', 'Asks "who", "what", "where" or "why" questions', 'Says what action is happening in a picture', 'Says their first name when asked', 'Talks well enough for others to understand most of the time'],
    cognitive: ['Draws a circle when you show them how', 'Avoids touching hot objects when you warn them'],
    motor: ['Strings items together, like large beads', 'Puts on some clothes by themselves', 'Uses a fork'],
  },
  48: {
    social: ['Pretends to be something else during play', 'Asks to go and play with children if none are around', 'Comforts others who are hurt or sad', 'Avoids danger', 'Likes to be a helper', 'Changes behaviour based on where they are'],
    language: ['Says sentences with four or more words', 'Says some words from a song, story or nursery rhyme', 'Talks about at least one thing that happened during their day', 'Answers simple questions'],
    cognitive: ['Names a few colours of items', 'Tells what comes next in a well-known story', 'Draws a person with three or more body parts'],
    motor: ['Catches a large ball most of the time', 'Serves themselves food or pours water with supervision', 'Unbuttons some buttons', 'Holds a crayon or pencil between fingers and thumb'],
  },
  60: {
    social: ['Follows rules or takes turns when playing games with other children', 'Sings, dances or acts for you', 'Does simple chores at home'],
    language: ['Tells a story they heard or made up with at least two events', 'Answers simple questions about a book or story', 'Keeps a conversation going with more than three back-and-forth exchanges', 'Uses or recognises simple rhymes'],
    cognitive: ['Counts to 10', 'Names some numbers between 1 and 5 when you point to them', 'Uses words about time, like yesterday and tomorrow', 'Pays attention for 5 to 10 minutes during an activity', 'Writes some letters in their name', 'Names some letters when you point to them'],
    motor: ['Buttons some buttons', 'Hops on one foot'],
  },
};

/**
 * Grace window before an unmet milestone is surfaced as "worth discussing".
 * Wider for older children because the checkpoints themselves are further apart.
 */
export function graceMonths(ageMonths) {
  if (ageMonths <= 12) return 1.5;
  if (ageMonths <= 24) return 2;
  return 3;
}

/** Flat, stable-keyed catalogue built once at module load. */
export const MILESTONES = CHECKPOINTS.flatMap((months) =>
  Object.entries(RAW[months]).flatMap(([domain, items]) =>
    items.map((text, i) => ({
      key: `m${months}-${domain}-${i + 1}`,
      months,
      domain,
      text,
    })),
  ),
);

export const MILESTONE_BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]));

export const SOURCE = {
  name: 'CDC "Learn the Signs. Act Early." developmental milestones',
  revision: '2022',
  citation: 'Zubler JM et al., Evidence-Informed Milestones for Developmental Surveillance Tools. Pediatrics. 2022;149(3):e2021052138',
  url: 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
};
