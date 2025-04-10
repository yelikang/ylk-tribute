// Thanks to https://github.com/jeff-collins/ment.io
import "./utils";

class TributeRange {
    constructor(tribute) {
        this.tribute = tribute
        this.tribute.range = this
    }

    getDocument() {
        let iframe
        if (this.tribute.current.collection) {
            iframe = this.tribute.current.collection.iframe
        }

        if (!iframe) {
            return document
        }

        return iframe.contentWindow.document
    }

    positionMenuAtCaret(scrollTo) {
        let context = this.tribute.current,
            coordinates

        let info = this.getTriggerInfo(false, this.tribute.hasTrailingSpace, true, this.tribute.allowSpaces, this.tribute.autocompleteMode)

        if (typeof info !== 'undefined') {

            if(!this.tribute.positionMenu){
                this.tribute.menu.style.cssText = `display: block;`
                return
            }

            if (!this.isContentEditable(context.element)) {
                coordinates = this.getTextAreaOrInputUnderlinePosition(this.tribute.current.element,
                    info.mentionPosition)
            }
            else {
                coordinates = this.getContentEditableCaretPosition(info.mentionPosition)
            }

            this.tribute.menu.style.cssText = `top: ${coordinates.top}px;
                                     left: ${coordinates.left}px;
                                     right: ${coordinates.right}px;
                                     bottom: ${coordinates.bottom}px;
                                     max-height: ${coordinates.maxHeight || 500}px;
                                     max-width: ${coordinates.maxWidth || 300}px;
                                     position: ${coordinates.position || 'absolute'};
                                     display: block;`

            if (coordinates.left === 'auto') {
                this.tribute.menu.style.left = 'auto'
            }

            if (coordinates.top === 'auto') {
                this.tribute.menu.style.top = 'auto'
            }

            if (scrollTo) this.scrollIntoView()

        } else {
            this.tribute.menu.style.cssText = 'display: none'
        }
    }

    get menuContainerIsBody() {
        return this.tribute.menuContainer === document.body || !this.tribute.menuContainer;
    }


    selectElement(targetElement, path, offset) {
        let range
        let elem = targetElement

        if (path) {
            for (var i = 0; i < path.length; i++) {
                elem = elem.childNodes[path[i]]
                if (elem === undefined) {
                    return
                }
                while (elem.length < offset) {
                    offset -= elem.length
                    elem = elem.nextSibling
                }
                if (elem.childNodes.length === 0 && !elem.length) {
                    elem = elem.previousSibling
                }
            }
        }
        let sel = this.getWindowSelection()

        range = this.getDocument().createRange()
        range.setStart(elem, offset)
        range.setEnd(elem, offset)
        range.collapse(true)

        try {
            sel.removeAllRanges()
        } catch (error) {}

        sel.addRange(range)
        targetElement.focus()
    }

    /**
     * 替换触发文本
     * @param {*} text 
     * @param {*} requireLeadingSpace 
     * @param {*} hasTrailingSpace 
     * @param {*} originalEvent 
     * @param {*} item 
     */
    replaceTriggerText(text, requireLeadingSpace, hasTrailingSpace, originalEvent, item) {
        let info = this.getTriggerInfo(true, hasTrailingSpace, requireLeadingSpace, this.tribute.allowSpaces, this.tribute.autocompleteMode)

        if (info !== undefined) {
            let context = this.tribute.current
            let replaceEvent = new CustomEvent('tribute-replaced', {
                detail: {
                    item: item,
                    instance: context,
                    context: info,
                    event: originalEvent,
                }
            })

            if (!this.isContentEditable(context.element)) {
                let myField = this.tribute.current.element
                let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                    ? this.tribute.replaceTextSuffix
                    : ' '
                text += textSuffix
                let startPos = info.mentionPosition
                let endPos = info.mentionPosition + info.mentionText.length + (textSuffix === '' ? 1 : textSuffix.length)
                if (!this.tribute.autocompleteMode) {
                    endPos += info.mentionTriggerChar.length - 1
                }
                myField.value = myField.value.substring(0, startPos) + text +
                    myField.value.substring(endPos, myField.value.length)
                myField.selectionStart = startPos + text.length
                myField.selectionEnd = startPos + text.length
            } else {
                // add a space to the end of the pasted text
                // 文本后端添加空格
                let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                    ? this.tribute.replaceTextSuffix
                    : '\xA0'
                text += textSuffix
                let endPos = info.mentionPosition + info.mentionText.length
                if (!this.tribute.autocompleteMode) {
                    endPos += info.mentionTriggerChar.length
                }
                this.pasteHtml(text, info.mentionPosition, endPos)
            }

            context.element.dispatchEvent(new CustomEvent('input', { bubbles: true }))
            context.element.dispatchEvent(replaceEvent)
        }
    }

    pasteHtml(html, startPos, endPos) {
        let range, sel
        sel = this.getWindowSelection()
        // 创建新选区，设置起始、结束位置；删除选区内容
        range = this.getDocument().createRange()
        range.setStart(sel.anchorNode, startPos)
        range.setEnd(sel.anchorNode, endPos)
        range.deleteContents()

        // 创建一个div，设置innerHTML为html
        let el = this.getDocument().createElement('div')
        el.innerHTML = html
        // 创建一个文档片段，用于存储html内容
        let frag = this.getDocument().createDocumentFragment(),
            node, lastNode
        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node)
        }
        range.insertNode(frag)

        // Preserve the selection
        if (lastNode) {
            // 克隆选区
            range = range.cloneRange()
            // 设置选区结束位置
            range.setStartAfter(lastNode)
            // 折叠选区
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
        }
    }

    getWindowSelection() {
        if (this.tribute.collection.iframe) {
            return this.tribute.collection.iframe.contentWindow.getSelection()
        }

        return window.getSelection()
    }

    getNodePositionInParent(element) {
        if (element.parentNode === null) {
            return 0
        }

        for (var i = 0; i < element.parentNode.childNodes.length; i++) {
            let node = element.parentNode.childNodes[i]

            if (node === element) {
                return i
            }
        }
    }

    getContentEditableSelectedPath(ctx) {
        let sel = this.getWindowSelection()
        // 当前选区所在的锚点节点
        let selected = sel.anchorNode
        let path = []
        let offset

        if (selected != null) {
            let i
            let ce = selected.contentEditable
            // 递归向上，一直找到contentEditable为true的节点(父节点)
            while (selected !== null && ce !== 'true') {
                // 获取当前节点在父节点中的位置
                i = this.getNodePositionInParent(selected)
                path.push(i)
                selected = selected.parentNode
                if (selected !== null) {
                    ce = selected.contentEditable
                }
            }
            path.reverse()

            // getRangeAt may not exist, need alternative
            // 光标在当前选区的偏移量
            offset = sel.getRangeAt(0).startOffset

            return {
                selected: selected,
                path: path,
                offset: offset
            }
        }
    }

    /**
     * 获取当前光标位置之前的文本
     * @returns 
     */
    getTextPrecedingCurrentSelection() {
        let context = this.tribute.current,
            text = ''

        if (!this.isContentEditable(context.element)) {
            let textComponent = this.tribute.current.element;
            if (textComponent) {
                let startPos = textComponent.selectionStart
                if (textComponent.value && startPos >= 0) {
                    text = textComponent.value.substring(0, startPos)
                }
            }

        } else {
            let selectedElem = this.getWindowSelection().anchorNode

            if (selectedElem != null) {
                let workingNodeContent = selectedElem.textContent
                let selectStartOffset = this.getWindowSelection().getRangeAt(0).startOffset

                if (workingNodeContent && selectStartOffset >= 0) {
                    text = workingNodeContent.substring(0, selectStartOffset)
                }
            }
        }

        return text
    }

    getLastWordInText(text) {
        var wordsArray;
        if (this.tribute.autocompleteSeparator) {
            wordsArray = text.split(this.tribute.autocompleteSeparator);
        } else {
            wordsArray = text.split(/\s+/);
        }
        var wordsCount = wordsArray.length - 1;
        return wordsArray[wordsCount];
    }

    /**
     * 获取触发信息
     * @param {*} menuAlreadyActive 菜单是否已经激活
     * @param {*} hasTrailingSpace 是否有尾随空格
     * @param {*} requireLeadingSpace 是否需要前导空格
     * @param {*} allowSpaces 是否允许空格
     * @param {*} isAutocomplete 是否自动补全
     * @returns 
     */
    getTriggerInfo(menuAlreadyActive, hasTrailingSpace, requireLeadingSpace, allowSpaces, isAutocomplete) {
        let ctx = this.tribute.current
        let selected, path, offset

        if (!this.isContentEditable(ctx.element)) {
            selected = this.tribute.current.element
        } else {
            let selectionInfo = this.getContentEditableSelectedPath(ctx)

            if (selectionInfo) {
                selected = selectionInfo.selected
                path = selectionInfo.path
                offset = selectionInfo.offset
            }
        }

        let effectiveRange = this.getTextPrecedingCurrentSelection()
        let lastWordOfEffectiveRange = this.getLastWordInText(effectiveRange)

        if (isAutocomplete) {
            return {
                mentionPosition: effectiveRange.length - lastWordOfEffectiveRange.length,
                mentionText: lastWordOfEffectiveRange,
                mentionSelectedElement: selected,
                mentionSelectedPath: path,
                mentionSelectedOffset: offset
            }
        }

        if (effectiveRange !== undefined && effectiveRange !== null) {
            let mostRecentTriggerCharPos = -1
            let triggerChar

            this.tribute.collection.forEach(config => {
                let c = config.trigger
                let idx = config.requireLeadingSpace ?
                    this.lastIndexWithLeadingSpace(effectiveRange, c) :
                    effectiveRange.lastIndexOf(c)

                if (idx > mostRecentTriggerCharPos) {
                    mostRecentTriggerCharPos = idx
                    triggerChar = c
                    requireLeadingSpace = config.requireLeadingSpace
                }
            })

            if (mostRecentTriggerCharPos >= 0 &&
                (
                    mostRecentTriggerCharPos === 0 ||
                    !requireLeadingSpace ||
                    /\s/.test(
                        effectiveRange.substring(
                            mostRecentTriggerCharPos - 1,
                            mostRecentTriggerCharPos)
                    )
                )
            ) {
                let currentTriggerSnippet = effectiveRange.substring(mostRecentTriggerCharPos + triggerChar.length,
                    effectiveRange.length)

                triggerChar = effectiveRange.substring(mostRecentTriggerCharPos, mostRecentTriggerCharPos + triggerChar.length)
                let firstSnippetChar = currentTriggerSnippet.substring(0, 1)
                let leadingSpace = currentTriggerSnippet.length > 0 &&
                    (
                        firstSnippetChar === ' ' ||
                        firstSnippetChar === '\xA0'
                    )
                if (hasTrailingSpace) {
                    currentTriggerSnippet = currentTriggerSnippet.trim()
                }

                let regex = allowSpaces ? /[^\S ]/g : /[\xA0\s]/g;

                this.tribute.hasTrailingSpace = regex.test(currentTriggerSnippet);

                if (!leadingSpace && (menuAlreadyActive || !(regex.test(currentTriggerSnippet)))) {
                    return {
                        mentionPosition: mostRecentTriggerCharPos,
                        // 搜索文案
                        mentionText: currentTriggerSnippet,
                        mentionSelectedElement: selected,
                        mentionSelectedPath: path,
                        mentionSelectedOffset: offset,
                        mentionTriggerChar: triggerChar
                    }
                }
            }
        }
    }

    lastIndexWithLeadingSpace (str, trigger) {
        let reversedStr = str.split('').reverse().join('')
        let index = -1

        for (let cidx = 0, len = str.length; cidx < len; cidx++) {
            let firstChar = cidx === str.length - 1
            let leadingSpace = /\s/.test(reversedStr[cidx + 1])

            let match = true
            for (let triggerIdx = trigger.length - 1; triggerIdx >= 0; triggerIdx--) {
              if (trigger[triggerIdx] !== reversedStr[cidx-triggerIdx]) {
                match = false
                break
              }
            }

            if (match && (firstChar || leadingSpace)) {
                index = str.length - 1 - cidx
                break
            }
        }

        return index
    }

    isContentEditable(element) {
        return element.nodeName !== 'INPUT' && element.nodeName !== 'TEXTAREA'
    }

    isMenuOffScreen(coordinates, menuDimensions) {
        let windowWidth = window.innerWidth
        let windowHeight = window.innerHeight
        let doc = document.documentElement
        let windowLeft = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0)
        let windowTop = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)

        let menuTop = typeof coordinates.top === 'number' ? coordinates.top : windowTop + windowHeight - coordinates.bottom - menuDimensions.height
        let menuRight = typeof coordinates.right === 'number' ? coordinates.right : coordinates.left + menuDimensions.width
        let menuBottom = typeof coordinates.bottom === 'number' ? coordinates.bottom : coordinates.top + menuDimensions.height
        let menuLeft = typeof coordinates.left === 'number' ? coordinates.left : windowLeft + windowWidth - coordinates.right - menuDimensions.width

        return {
            top: menuTop < Math.floor(windowTop),
            right: menuRight > Math.ceil(windowLeft + windowWidth),
            bottom: menuBottom > Math.ceil(windowTop + windowHeight),
            left: menuLeft < Math.floor(windowLeft)
        }
    }
    /**
     * 计算菜单的尺寸（先渲染在页面，获取到元素的宽高，然后隐藏）
     * @returns 
     */

    getMenuDimensions() {
        // Width of the menu depends of its contents and position
        // We must check what its width would be without any obstruction
        // This way, we can achieve good positioning for flipping the menu
        let dimensions = {
            width: null,
            height: null
        }

        this.tribute.menu.style.cssText = `top: 0px;
                                 left: 0px;
                                 position: fixed;
                                 display: block;
                                 visibility; hidden;
                                 max-height:500px;`
       dimensions.width = this.tribute.menu.offsetWidth
       dimensions.height = this.tribute.menu.offsetHeight

       this.tribute.menu.style.cssText = `display: none;`

       return dimensions
    }

    getTextAreaOrInputUnderlinePosition(element, position, flipped) {
        let properties = ['direction', 'boxSizing', 'width', 'height', 'overflowX',
            'overflowY', 'borderTopWidth', 'borderRightWidth',
            'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'paddingTop',
            'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
            'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
            'textAlign', 'textTransform', 'textIndent',
            'textDecoration', 'letterSpacing', 'wordSpacing'
        ]

        let isFirefox = (window.mozInnerScreenX !== null)

        let div = this.getDocument().createElement('div')
        div.id = 'input-textarea-caret-position-mirror-div'
        this.getDocument().body.appendChild(div)

        let style = div.style
        let computed = window.getComputedStyle ? getComputedStyle(element) : element.currentStyle

        style.whiteSpace = 'pre-wrap'
        if (element.nodeName !== 'INPUT') {
            style.wordWrap = 'break-word'
        }

        style.position = 'absolute'
        style.visibility = 'hidden'

        // transfer the element's properties to the div
        properties.forEach(prop => {
            style[prop] = computed[prop]
        })

        //NOT SURE WHY THIS IS HERE AND IT DOESNT SEEM HELPFUL
        // if (isFirefox) {
        //     style.width = `${(parseInt(computed.width) - 2)}px`
        //     if (element.scrollHeight > parseInt(computed.height))
        //         style.overflowY = 'scroll'
        // } else {
        //     style.overflow = 'hidden'
        // }

        let span0 = document.createElement('span')
        span0.textContent =  element.value.substring(0, position)
        div.appendChild(span0)

        if (element.nodeName === 'INPUT') {
            div.textContent = div.textContent.replace(/\s/g, ' ')
        }

        //Create a span in the div that represents where the cursor
        //should be
        let span = this.getDocument().createElement('span')
        //we give it no content as this represents the cursor
        span.textContent = '&#x200B;'
        div.appendChild(span)

        let span2 = this.getDocument().createElement('span');
        span2.textContent = element.value.substring(position);
        div.appendChild(span2);

        let rect = element.getBoundingClientRect()

        //position the div exactly over the element
        //so we can get the bounding client rect for the span and
        //it should represent exactly where the cursor is
        div.style.position = 'fixed';
        div.style.left = rect.left + 'px';
        div.style.top = rect.top + 'px';
        div.style.width = rect.width + 'px';
        div.style.height = rect.height + 'px';
        div.scrollTop = element.scrollTop;

        var spanRect = span.getBoundingClientRect();
        this.getDocument().body.removeChild(div)
        return this.getFixedCoordinatesRelativeToRect(spanRect);
    }

    getContentEditableCaretPosition(selectedNodePosition) {
        let range
        let sel = this.getWindowSelection()

        range = this.getDocument().createRange()
        range.setStart(sel.anchorNode, selectedNodePosition)
        range.setEnd(sel.anchorNode, selectedNodePosition)

        range.collapse(false)

        let rect = range.getBoundingClientRect()

        return this.getFixedCoordinatesRelativeToRect(rect);
    }

    /**
     * 获取菜单坐标位置
     * @param {*} rect 
     * @returns 
     */
    getFixedCoordinatesRelativeToRect(rect) {
        let coordinates = {
            position: 'fixed',
            left: rect.left,
            top: rect.top + rect.height
        }
        // 获取菜单的尺寸
        let menuDimensions = this.getMenuDimensions()

        // 获取当前元素上下可用空间
        var availableSpaceOnTop = rect.top;
        var availableSpaceOnBottom = window.innerHeight - (rect.top + rect.height);

        //check to see where's the right place to put the menu vertically
        // 下方空间不够渲染（就使用bottom定位）
        if (availableSpaceOnBottom < menuDimensions.height) {
          // 上方空间足够渲染  || 上方空间大于下方空间
          if (availableSpaceOnTop >= menuDimensions.height || availableSpaceOnTop > availableSpaceOnBottom) {
            coordinates.top = 'auto';
            coordinates.bottom = window.innerHeight - rect.top;
            if (availableSpaceOnBottom < menuDimensions.height) {
              coordinates.maxHeight = availableSpaceOnTop;
            }
          } else {
            // 上方空间不够渲染，并且上方空间小于下方空间；就采用top定位，渲染在元素下方
            if (availableSpaceOnTop < menuDimensions.height) {
                // 最大高度不能超过下方空间
              coordinates.maxHeight = availableSpaceOnBottom;
            }
          }
        }

        // 获取当前元素左右可用空间
        var availableSpaceOnLeft = rect.left;
        var availableSpaceOnRight = window.innerWidth - rect.left;

        //check to see where's the right place to put the menu horizontally
        if (availableSpaceOnRight < menuDimensions.width) {
          if (availableSpaceOnLeft >= menuDimensions.width || availableSpaceOnLeft > availableSpaceOnRight) {
            coordinates.left = 'auto';
            coordinates.right = window.innerWidth - rect.left;
            if (availableSpaceOnRight < menuDimensions.width) {
              coordinates.maxWidth = availableSpaceOnLeft;
            }
          } else {
            if (availableSpaceOnLeft < menuDimensions.width) {
              coordinates.maxWidth = availableSpaceOnRight;
            }
          }
        }

        return coordinates
    }

    scrollIntoView(elem) {
        let reasonableBuffer = 20,
            clientRect
        let maxScrollDisplacement = 100
        let e = this.menu

        if (typeof e === 'undefined') return;

        while (clientRect === undefined || clientRect.height === 0) {
            clientRect = e.getBoundingClientRect()

            if (clientRect.height === 0) {
                e = e.childNodes[0]
                if (e === undefined || !e.getBoundingClientRect) {
                    return
                }
            }
        }

        let elemTop = clientRect.top
        let elemBottom = elemTop + clientRect.height

        if (elemTop < 0) {
            window.scrollTo(0, window.pageYOffset + clientRect.top - reasonableBuffer)
        } else if (elemBottom > window.innerHeight) {
            let maxY = window.pageYOffset + clientRect.top - reasonableBuffer

            if (maxY - window.pageYOffset > maxScrollDisplacement) {
                maxY = window.pageYOffset + maxScrollDisplacement
            }

            let targetY = window.pageYOffset - (window.innerHeight - elemBottom)

            if (targetY > maxY) {
                targetY = maxY
            }

            window.scrollTo(0, targetY)
        }
    }
}


export default TributeRange;
