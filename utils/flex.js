/**
 * LINE Flex Message Utility Functions
 * Standardizes the construction of Flex Bubbles, Boxes, and Text components.
 */

/**
 * Create a Flex Bubble
 * @param {Object} options
 * @param {string} [options.size] - 'nano', 'micro', 'kilo', 'mega', 'giga'
 * @param {Object} [options.header] - Header box component
 * @param {Object} [options.body] - Body box component
 * @param {Object} [options.footer] - Footer box component
 * @param {Object} [options.styles] - Styles object
 */
function createBubble({ size = 'medium', header, body, footer, styles }) {
    return {
        type: 'bubble',
        size,
        header,
        body,
        footer,
        styles
    };
}

/**
 * Create a standard Header Box
 * @param {string} title
 * @param {string} subtitle
 * @param {string} color - Background color
 * @param {string} [textColor='#FFFFFF']
 */
function createHeader(title, subtitle = '', color = '#000000', textColor = '#FFFFFF') {
    const contents = [
        {
            type: 'text',
            text: title,
            weight: 'bold',
            color: textColor,
            size: 'md' // Standard size for headers
        }
    ];

    if (subtitle) {
        contents.push({
            type: 'text',
            text: subtitle,
            color: '#DDDDDD', // Slightly dimmer text
            size: 'xxs'
        });
    }

    return {
        type: 'box',
        layout: 'vertical',
        contents,
        backgroundColor: color,
        paddingAll: '10px'
    };
}

/**
 * Create a standard Text Component
 * @param {Object} options
 */
function createText({ text, size = 'sm', color = '#666666', weight = 'regular', align, margin, flex, gravity, wrap, action }) {
    return {
        type: 'text',
        text,
        size,
        color,
        weight,
        align,
        margin,
        flex,
        gravity,
        wrap,
        action
    };
}

/**
 * Create a Separator
 * @param {string} [margin='md']
 * @param {string} [color]
 */
function createSeparator(margin = 'md', color) {
    return {
        type: 'separator',
        margin,
        color
    };
}

/**
 * Create a Box
 * @param {string} layout - 'vertical', 'horizontal', 'baseline'
 * @param {Array} contents
 * @param {Object} [options] - padding, margin, etc.
 */
function createBox(layout, contents, options = {}) {
    return {
        type: 'box',
        layout,
        contents,
        ...options
    };
}

/**
 * Wrapper for Flex Carousel
 * @param {Array} bubbles
 */
function createCarousel(bubbles) {
    return {
        type: 'carousel',
        contents: bubbles
    };
}

/**
 * Wrapper for Flex Container (when sending via replyFlex)
 * @param {string} altText
 * @param {Object} contents - Bubble or Carousel
 */
function createFlexMessage(altText, contents) {
    return {
        type: 'flex',
        altText,
        contents
    };
}

module.exports = {
    createBubble,
    createHeader,
    createText,
    createSeparator,
    createBox,
    createCarousel,
    createFlexMessage
};
