/**
 * Style registry.
 *
 * Each style is a first-class, declarative definition: the product team can add
 * a new scene by appending one entry here — no UI or API changes required.
 * The `prompt` is sent verbatim to the image-editing model together with the
 * user's photo.
 */

export interface StyleDefinition {
  /** Stable identifier used by the client UI and the API contract. */
  id: string;
  /** Human-readable name shown in the style picker. */
  name: string;
  /** One-line description shown under the style name. */
  tagline: string;
  /** Emoji rendered on the style card. */
  emoji: string;
  /** Tailwind gradient classes for the style card artwork. */
  gradient: string;
  /**
   * Instruction sent to the image model. Must instruct the model to preserve
   * the subject's identity — every style relies on the same contract:
   * "take the person in the photo and put them in this scene".
   */
  prompt: string;
}

/**
 * Shared by every style: the identity-preservation contract appended to each
 * scene prompt. Exported so /api/styles can serve it for the docs page.
 */
export const IDENTITY_PRESERVATION =
  "Keep the person's face, features, hairstyle, skin tone, and body proportions exactly " +
  "identical to the source photo — they must remain recognizably the same person. " +
  "Dress them appropriately for the scene. Integrate them seamlessly: match the scene's " +
  "lighting direction, color temperature, shadows, perspective, depth of field, and grain. " +
  "The final image must look like a single authentic photograph, not a collage or composite. " +
  "Output a single photorealistic image with no text, watermarks, or borders.";

export const STYLES: StyleDefinition[] = [
  {
    id: "office",
    name: "Office",
    tagline: "In a modern corner office at work",
    emoji: "💼",
    gradient: "from-sky-500/80 to-indigo-600/80",
    prompt:
      "Place the person from the photo into a bright, modern executive office. " +
      "The setting: floor-to-ceiling windows with a soft daylight city skyline behind them, " +
      "a polished walnut desk with a closed laptop, an ergonomic chair, and a blurred open-plan " +
      "workspace in the background. They are seated or standing behind the desk, wearing smart " +
      "business attire, relaxed and confident, looking toward the camera. " +
      "Soft natural window light lights their face, with a subtle rim light from the skyline. " +
      "Shot as a professional corporate portrait on a full-frame camera with an 85mm lens at f/2.8. " +
      IDENTITY_PRESERVATION,
  },
  {
    id: "beach",
    name: "Beach",
    tagline: "Golden hour on a tropical shore",
    emoji: "🏝️",
    gradient: "from-cyan-400/80 to-teal-600/80",
    prompt:
      "Place the person from the photo on a tropical beach at golden hour. " +
      "The setting: soft sand, turquoise water with gentle waves, palm trees framing one side, " +
      "and a warm low sun behind them creating a glow around their silhouette. " +
      "They wear light summer clothing, walking barefoot and smiling naturally. " +
      "Shot on a 50mm lens at f/2, warm film-like color grading. " +
      IDENTITY_PRESERVATION,
  },
  {
    id: "cafe",
    name: "Café",
    tagline: "Morning coffee at a cozy café",
    emoji: "☕",
    gradient: "from-amber-400/80 to-orange-600/80",
    prompt:
      "Place the person from the photo in a cozy, upscale café. " +
      "The setting: a marble table with a latte and a croissant, warm pendant lights overhead, " +
      "large windows with soft morning light, and softly blurred patrons and shelves of pastries " +
      "in the background. They sit with a cappuccino, mid-conversation, laughing gently. " +
      "Shot on a 35mm lens at f/1.8, warm cozy tones. " +
      IDENTITY_PRESERVATION,
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "Clean professional studio portrait",
    emoji: "📸",
    gradient: "from-zinc-400/80 to-zinc-700/80",
    prompt:
      "Re-render the person from the photo in a professional photography studio. " +
      "The setting: a seamless light-grey backdrop, a large softbox key light at 45 degrees, " +
      "a subtle hair light, and a faint rim on the opposite side. " +
      "Head-and-shoulders composition, sharp catchlights in the eyes, wearing a plain " +
      "button-down shirt or blazer. Shot on a 85mm lens at f/8 with crisp studio detail. " +
      IDENTITY_PRESERVATION,
  },
  {
    id: "nightscape",
    name: "City Night",
    tagline: "Neon-lit street after rain",
    emoji: "🌃",
    gradient: "from-fuchsia-500/80 to-purple-700/80",
    prompt:
      "Place the person from the photo on a neon-lit city street at night after rain. " +
      "The setting: wet asphalt reflecting colorful signs, glowing storefronts and traffic bokeh, " +
      "light mist in the air. They wear a stylish dark coat, standing in the middle of the " +
      "crosswalk looking to the side. Neon signs tint their face with soft magenta and cyan light. " +
      "Shot on a 50mm lens at f/1.4, cinematic night-photography color grade. " +
      IDENTITY_PRESERVATION,
  },
  {
    id: "alpine",
    name: "Alpine",
    tagline: "Snow-capped mountain summit",
    emoji: "🏔️",
    gradient: "from-emerald-400/80 to-sky-700/80",
    prompt:
      "Place the person from the photo on a scenic alpine mountain summit at sunrise. " +
      "The setting: snow-capped peaks layered into the distance, a pristine trail behind them, " +
      "crisp cold air with soft golden sunlight and long shadows. " +
      "They wear a technical hiking jacket, backpack on, standing tall and cheerful. " +
      "Shot on a 35mm lens at f/5.6, high-altitude clarity with natural colors. " +
      IDENTITY_PRESERVATION,
  },
];

export const DEFAULT_STYLE_ID = "office";

export function getStyle(id: string): StyleDefinition | undefined {
  return STYLES.find((style) => style.id === id);
}

export function getStyleOrThrow(id: string): StyleDefinition {
  const style = getStyle(id);
  if (!style) {
    throw new Error(`Unknown style: ${id}`);
  }
  return style;
}
