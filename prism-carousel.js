const CLASSES = {
  scene: ['scene'],
  prism: ['prism'],
};

class Utils {
  /**
   * @param {HTMLElement} el
   * @param {string[]} classes
   */
  static fillClasses(el, classes) {
    for (const className of classes) {
      if (!el.classList.contains(className)) {
        el.classList.add(className);
      }
    }
  }

  /**
   * @param {HTMLElement} el
   * @param {Object} styles
   */
  static setStyles(el, styles) {
    for (const [prop, value] of Object.entries(styles)) {
      if (value === null) {
        el.style.removeProperty(prop);
      } else {
        el.style.setProperty(prop, value);
      }
    }
  }

  /**
   * @param {Object} options
   * @param {string} options.tag
   * @param {Object} [options.attributes]
   * @param {Object} [options.events]
   * @param {string} [options.content]
   * @param {Array|null} [options.children]
   * @param {HTMLElement|null} [attachTo]
   * @returns {HTMLElement}
   */
  static spawn(options = {}, attachTo = null) {
    const { tag, attributes, events, content, children = null } = options;
    const element = document.createElement(tag);
    attributes && Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    events && Object.entries(events).forEach(([key, value]) => {
      element.addEventListener(key, value);
    });
    if (content) {
      element.innerHTML = content;
    }
    if (attachTo) {
      attachTo.appendChild(element);
    }
    if (children?.length) {
      children.forEach((conf) => {
        Utils.spawn(conf, element);
      });
    }
    return element;
  };

  static getDebouncer(delay = 100) {
    let timeout, iter = 1;
    return (callback, cancelCallback = null) => {
      if (timeout) {
        if (typeof cancelCallback === 'function') {
          cancelCallback(iter);
        }
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        callback(iter);
        iter = 1;
      }, delay);
      iter++;
    };
  }
}

const STYLES_ID = 'prism-styles';

/**
 * @typedef {Object} PrismCarouselConfig
 * @property {string} target - query selector string
 * @property {string[]} images - list of images
 * @property {number} width - scene width
 * @property {number} height - scene height
 * @property {number} [animationDuration=500] - animation duration
 * @property {number} [animationTimingFunc='ease-in-out'] - animation timing function
 * @property {boolean} [asImages=false] - render "img" elements
 * @property {number} [initialSlide=0] - initially visible slide
 * @property {number} [gap=0] - gap
 */

/**
 * @class PrismCarousel
 */
class PrismCarousel {
  /**
   * @type {PrismCarouselConfig}
   */
  #conf;
  /**
   * @type {boolean}
   */
  #initiated = false;
  #computed = {
    facets: 0,
    radius: 0,
    angle: 0,
  };
  /**
   * @type {number}
   */
  #currentSlide = 0;
  /**
   * @type {Map<number, number>}
   */
  #slidesMap = new Map();
  #navDebouncer = Utils.getDebouncer(250);

  static DEFAULTS = {
    animationDuration: 500,
    animationTimingFunc: 'ease-in-out',
    asImages: false,
    initialSlide: 0,
  };

  /**
   *
   * @param {PrismCarouselConfig} conf
   */
  constructor(conf) {
    if (!conf) {
      throw new Error('Missed configuration object');
    }
    this.#conf = {
      ...PrismCarousel.DEFAULTS,
      ...conf,
    };
    const { target } = this.#conf;
    if (!target) {
      throw new Error('Please specify "target"');
    }
    this.sceneElement = document.querySelector(target);
    if (!this.sceneElement) {
      throw new Error(`Can not find "${target}"`);
    }
    this.styleElement = document.getElementById(STYLES_ID);
    if (!this.styleElement) {
      this.styleElement = Utils.spawn({ tag: 'style', attributes: { id: STYLES_ID } }, document.head);
    }
    this.init();
  }

  init = () => {
    const { images, width, height, animationDuration, animationTimingFunc, asImages, initialSlide, gap } = this.#conf;
    const slideWidth = width + gap;
    const facets = images.length;
    const radius = Math.ceil(slideWidth / (Math.tan(Math.PI / facets) * 2));
    Utils.fillClasses(this.sceneElement, CLASSES.scene);
    Utils.setStyles(this.sceneElement, {
      '--scene-width': width,
      '--scene-height': height,
      '--r-inner': radius,
      '--animation-duration': animationDuration,
      '--animation-timing-func': animationTimingFunc,
    });
    const { styles, slidesMap } = PrismCarousel.generatePrismStyles(facets, radius, '.scene .prism .slide');
    this.styleElement.innerHTML = styles;
    this.#slidesMap = slidesMap;
    this.#computed = { facets, radius, angle: 360 / facets };
    this.#currentSlide = initialSlide;
    this.#setViewAngle(slidesMap.get(this.#currentSlide));
    this.prismElement = Utils.spawn({
      tag: 'div',
      attributes: {
        class: [...CLASSES.prism, asImages ? 'use-img' : 'use-bg'].join(' '),
      },
      children: images.map(src => {
        if (asImages) {
          return { tag: 'img', attributes: { src, width, height, class: 'slide' } };
        }
        return { tag: 'div', attributes: { class: 'slide', style: `background-image: url('${src}')` } };
      }),
    }, this.sceneElement);
    this.#initiated = true;
  };

  next = () => {
    let delta = 1;
    this.#navDebouncer(
      () => {
        this.showSlide(this.#currentSlide + delta);
      },
      (iter) => {
        delta = iter;
      },
    );
  };

  prev = () => {
    let delta = 1;
    this.#navDebouncer(
      () => {
        this.showSlide(this.#currentSlide - delta);
      },
      (iter) => {
        delta = iter;
      },
    );
  };

  showSlide = (n) => {
    if (!this.#initiated) {
      throw new Error('The carousel does not initiated yet!');
    }
    const { facets } = this.#computed;
    let slide = n % facets;
    if (slide < 0) {
      slide = facets + slide;
    }
    const prevAngle = this.#slidesMap.get(this.#currentSlide);
    this.#currentSlide = slide;
    const angle = this.#slidesMap.get(this.#currentSlide);
    const dif = Math.abs(prevAngle - angle);
    if (dif > 180) {
      this.#setViewAngle(angle === 0 ? -360 : angle + 360);
      setTimeout(() => {
        this.#toggleAnimation(false);
        this.#setViewAngle(angle);
        setTimeout(() => {
          this.#toggleAnimation(true);
        }, 100);
      }, this.#conf.animationDuration);
    } else {
      this.#setViewAngle(angle);
    }
  };

  #setViewAngle = (angle) => {
    this.sceneElement.style.setProperty('--rot-angle', angle);
  };

  #toggleAnimation = (state) => {
    if (state) {
      this.prismElement.classList.remove('off-animation');
    } else {
      this.prismElement.classList.add('off-animation');
    }
  };

  static generatePrismStyles(n, r, selectorPrefix = '') {
    const blocks = Array(n);
    const angleStep = 360 / n;
    const slidesMap = new Map();
    for (let i = 0, angle = 0; i < n; i++, angle += angleStep) {
      blocks[i] = `${selectorPrefix}:nth-child(${i + 1}){transform:rotateY(${angle}deg) translate3d(0, 0, ${r}px)}`;
      slidesMap.set(i, -angle);
    }
    blocks.push(`${selectorPrefix}:nth-child(n+${n + 1}){display:none}`);
    return {
      styles: blocks.join('\n'),
      slidesMap,
    };
  }
}
