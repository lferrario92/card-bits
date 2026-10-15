<template>
  <div
    ref="containerRef"
    :class="['relative flex items-center justify-center', className]"
    :style="{
      width: `${containerWidth}px`,
      height: `${containerHeight}px`
    }"
    @click="handleContainerClick"
    @contextmenu.prevent
  >
    <div
      v-for="(card, idx) in cards"
      :key="card.id"
      :class="`card card-${idx} absolute`"
      :data-card-id="card.id"
      :style="{
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        boxShadow: focusedIndex === idx ? '0 12px 30px rgba(0, 0, 0, 0.3)' : '0 4px 10px rgba(0, 0, 0, 0.2)',
        zIndex: focusedIndex === idx ? 100 : cards.length - idx,
        borderRadius: '30px',
        cursor: props.enableHover ? 'pointer' : 'default',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }"
      @click.stop="handleCardClick(idx)"
      @contextmenu.prevent
    >
      <div class="card-inner relative w-full h-full rounded-[30px] overflow-hidden">
        <img class="w-full h-full object-cover"
          :class="canPlay(card) ? '' : 'grayscale-[0.6] brightness-75'"
          :src="card.image" :alt="card.title" draggable="false" />

        <!-- mana cost -->
        <span class="absolute top-1 left-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow">
          {{ card.manaCost }}
        </span>
        <!-- creature stats -->
        <template v-if="card.type === 'creature'">
          <span class="absolute bottom-1 left-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-md bg-amber-500 text-white text-[11px] font-bold shadow">
            {{ card.attack ?? 0 }}
          </span>
          <span class="absolute bottom-1 right-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-md bg-rose-600 text-white text-[11px] font-bold shadow">
            {{ card.health ?? 1 }}
          </span>
        </template>
        <!-- charge keyword -->
        <span v-if="card.charge"
          class="absolute top-1 right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-br-md bg-indigo-400 text-white text-[9px] font-bold shadow"
          title="Charge: can attack immediately">
          ⚡
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap';
import { nextTick, onMounted, onUnmounted, ref, watch, computed } from 'vue';
import type { CardData } from '@/game/types';

export type { CardData };

export interface BounceCardsProps {
  className?: string;
  cards?: CardData[];
  containerWidth?: number;
  containerHeight?: number;
  animationDelay?: number;
  animationStagger?: number;
  easeType?: string;
  transformStyles?: string[];
  enableHover?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  drawOrigin?: { x: number; y: number } | null;
  /** When set, cards costing more than this are dimmed. */
  availableMana?: number;
}

const props = withDefaults(defineProps<BounceCardsProps>(), {
  className: '',
  cards: () => [],
  containerWidth: 400,
  containerHeight: 400,
  animationDelay: 0.5,
  animationStagger: 0.06,
  easeType: 'elastic.out(1, 0.8)',
  transformStyles: () => [],
  enableHover: false,
  cardWidth: 200,
  cardHeight: 200,
});

const emit = defineEmits<{
  'card-selected': [CardData | null]
  'card-played': [CardData]
}>()

const containerRef = ref<HTMLElement | null>(null);
const focusedIndex = ref<number | null>(null);

function canPlay(card: CardData): boolean {
  return props.availableMana == null ? true : card.manaCost <= props.availableMana;
}

const baseTransforms = computed(() => props.transformStyles.length > 0 ? props.transformStyles : generateDefaultArcTransforms());

const cardWidth = computed(() => {
  const maxWidth = Math.min(props.cardWidth, props.containerWidth / 4);
  return Math.max(maxWidth, 60);
});

const cardHeight = computed(() => {
  const maxHeight = Math.min(props.cardHeight, props.containerHeight / 2);
  return Math.max(maxHeight, 60);
});

function findOuter(cardId: number): HTMLElement | null {
  if (!containerRef.value) return null;
  return containerRef.value.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
}

function findInner(cardId: number): HTMLElement | null {
  const outer = findOuter(cardId);
  return outer ? outer.querySelector<HTMLElement>('.card-inner') : null;
}

function getOuterElements(): HTMLElement[] {
  return props.cards.map(c => findOuter(c.id)).filter((el): el is HTMLElement => !!el);
}

// Parse our known transform string formats into GSAP-friendly numbers
function parseTransform(str: string): { x: number; y: number; scale: number } {
  const t = { x: 0, y: 0, scale: 1 };
  if (!str || str === 'none') return t;
  const tr = str.match(/translate\(\s*(-?\d*\.?\d+)px?\s*,\s*(-?\d*\.?\d+)px?\s*\)/);
  if (tr) {
    t.x = parseFloat(tr[1]);
    t.y = parseFloat(tr[2]);
  }
  const sc = str.match(/scale\(\s*(-?\d*\.?\d+)\s*\)/);
  if (sc) t.scale = parseFloat(sc[1]);
  return t;
}

function generateDefaultArcTransforms(): string[] {
  const count = props.cards.length;
  if (count === 0) return [];

  const maxSpread = props.containerWidth * 0.85;
  const step = count > 1 ? maxSpread / (count - 1) : 0;
  const radius = maxSpread / 2 + 180;
  const arcHeight = radius * 0.22;

  return Array.from({ length: count }, (_, i) => {
    const x = -maxSpread / 2 + i * step;
    const normalizedX = x / radius;
    const y = -arcHeight * (1 - normalizedX * normalizedX);
    return `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  });
}

function computeFocusedTransforms(focusIdx: number): string[] {
  const count = props.cards.length;
  if (count === 0) return [];
  if (count === 1) return ['translate(0, 0)'];

  const maxSpread = props.containerWidth * 0.85;
  const cardW = cardWidth.value;
  const focusedX = 0;

  return Array.from({ length: count }, (_, i) => {
    if (i === focusIdx) {
      return `translate(0, -50px) scale(1.12)`;
    }

    const side = i < focusIdx ? -1 : 1;
    const distance = Math.abs(i - focusIdx);
    const baseX = focusedX + side * (cardW * 0.75 + 15) * distance;
    const clampedX = Math.max(-maxSpread / 2, Math.min(maxSpread / 2, baseX));
    const normalizedX = clampedX / (maxSpread / 2 + 180);
    const radius = maxSpread / 2 + 180;
    const arcHeight = radius * 0.22;
    const y = -arcHeight * (1 - normalizedX * normalizedX) + 25 * distance;

    return `translate(${clampedX.toFixed(0)}px, ${y.toFixed(0)}px) scale(${1 - distance * 0.06})`;
  });
}

interface ApplyOptions {
  instantIds?: number[];
  ease?: string;
  stagger?: number;
}

// GSAP fully owns the outer transform so DOM index shifting never causes snaps
function applyTransforms(targets: string[], duration = 0.42, opts: ApplyOptions = {}) {
  const instantIds = opts.instantIds ?? [];
  const ease = opts.ease ?? 'power3.out';
  const stagger = opts.stagger ?? 0;

  props.cards.forEach((card, i) => {
    const el = findOuter(card.id);
    if (!el) return;

    const { x, y, scale } = parseTransform(targets[i] ?? 'none');
    gsap.killTweensOf(el);

    if (duration <= 0 || instantIds.includes(card.id)) {
      gsap.set(el, { x, y, scale });
    } else {
      gsap.to(el, {
        x, y, scale,
        duration,
        ease,
        delay: stagger * i,
        overwrite: 'auto',
      });
    }
  });
}

const playEntranceAnimation = () => {
  const els = getOuterElements();
  if (!els.length) return;
  gsap.fromTo(
    els,
    { scale: 0 },
    {
      scale: 1,
      stagger: props.animationStagger,
      ease: props.easeType,
      delay: props.animationDelay,
    }
  );
};

const handleCardClick = (idx: number) => {
  if (!props.enableHover) return;

  if (focusedIndex.value === idx) {
    handleBlur();
  } else {
    focusedIndex.value = idx;
    applyTransforms(computeFocusedTransforms(idx), 0.45, { ease: 'back.out(1.4)' });
    emit('card-selected', props.cards[idx]);
  }
};

const handleContainerClick = () => {
  if (!props.enableHover) return;
  handleBlur();
};

const handleBlur = () => {
  if (!props.enableHover) return;
  focusedIndex.value = null;
  applyTransforms(baseTransforms.value, 0.45, { ease: 'power3.out' });
  emit('card-selected', null);
};

// A freshly drawn card flies in from the deck
function animateDraw(cardId: number) {
  const origin = props.drawOrigin;
  const outer = findOuter(cardId);
  const inner = findInner(cardId);
  if (!outer || !inner) return;

  if (!origin) {
    gsap.fromTo(inner, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
    return;
  }

  const rect = outer.getBoundingClientRect();
  const dx = origin.x - (rect.left + rect.width / 2);
  const dy = origin.y - (rect.top + rect.height / 2);

  gsap.set(inner, { x: dx, y: dy, scale: 0.6, opacity: 0, rotate: -18 });
  gsap.to(inner, {
    x: 0, y: 0, scale: 1, opacity: 1, rotate: 0,
    duration: 0.55,
    ease: 'back.out(1.3)',
  });
}

// A played card flies forward / up and disappears
function playCardOut(cardId: number): Promise<void> {
  const inner = findInner(cardId);
  if (!inner) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.killTweensOf(inner);
    gsap.to(inner, {
      y: -170,
      scale: 1.7,
      rotate: 5,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in',
      onComplete: () => resolve(),
    });
  });
}

defineExpose({ playCardOut });

onMounted(async () => {
  await nextTick();
  applyTransforms(baseTransforms.value, 0);
  playEntranceAnimation();
});

// Single watcher: animate reflow whenever hand composition OR layout transforms change
watch(
  () => props.cards.map(c => c.id).join(',') + '|' + props.transformStyles.join('|'),
  async (_nv, oldVal) => {
    const newIds = props.cards.map(c => c.id);
    const oldIdPart = oldVal ? oldVal.split('|')[0] : '';
    const oldIds = oldIdPart ? oldIdPart.split(',').filter(Boolean).map(Number) : [];

    await nextTick();
    focusedIndex.value = null;

    const addedId = newIds.length > oldIds.length ? newIds[newIds.length - 1] : null;

    applyTransforms(baseTransforms.value, 0.45, {
      ease: 'power3.out',
      instantIds: addedId != null ? [addedId] : [],
    });

    if (addedId != null) animateDraw(addedId);
  }
);

onUnmounted(() => {
  gsap.killTweensOf(getOuterElements());
  props.cards.forEach(c => {
    const inner = findInner(c.id);
    if (inner) gsap.killTweensOf(inner);
  });
});
</script>