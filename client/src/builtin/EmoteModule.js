/**
 * BetterDiscord Emote Module
 * Copyright (c) 2015-present Jiiks/JsSucks - https://github.com/Jiiks / https://github.com/JsSucks
 * All rights reserved.
 * https://betterdiscord.net
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
*/

import BuiltinModule from './BuiltinModule';
import path from 'path';
import { Utils, FileUtils, ClientLogger as Logger } from 'common';
import { Settings, Globals, WebpackModules, ReactComponents, MonkeyPatch, Cache } from 'modules';
import { VueInjector } from 'ui';

import Emote from './EmoteComponent.js';
import Autocomplete from '../ui/components/common/Autocomplete.vue';

import GlobalAc from '../ui/autocomplete';

const EMOTE_SOURCES = [
    'https://static-cdn.jtvnw.net/emoticons/v1/:id/1.0',
    'https://cdn.frankerfacez.com/emoticon/:id/1',
    'https://cdn.betterttv.net/emote/:id/1x'
]

export default new class EmoteModule extends BuiltinModule {

    get dbpath() { return path.join(Globals.getPath('data'), 'emotes.json') }
    
    get database() { return this._db || (this._db = new Map()) }

    get favourites() { return this._favourites || (this._favourites = []) }

    get settingPath() { return ['emotes', 'default', 'enable'] }

    async enabled() {

        GlobalAc.add(';', this);

        if (!this.database.size) {
            await this.loadLocalDb();
        }

        this.patchMessageContent();
        const cta = await ReactComponents.getComponent('ChannelTextArea', { selector: WebpackModules.getSelector('channelTextArea', 'emojiButton') });
        MonkeyPatch('BD:EMOTEMODULE', cta.component.prototype).before('handleSubmit', this.handleChannelTextAreaSubmit.bind(this));
    }

    async disabled() {
        for (const patch of Patcher.getPatchesByCaller('BD:EMOTEMODULE')) patch.unpatch();
    }

    processMarkup(markup) {
        const newMarkup = [];
        const jumboable = !markup.some(child => {
            if (typeof child !== 'string') return false;

            return / \w+/g.test(child);
        });

        for (const child of markup) {
            if (typeof child !== 'string') {
                if (typeof child === 'object') {
                    const isEmoji = Utils.findInReactTree(child, 'emojiName');
                    if (isEmoji) child.props.children.props.jumboable = jumboable;
                }
                newMarkup.push(child);
                continue;
            }

            if (!/:(\w+):/g.test(child)) {
                newMarkup.push(child);
                continue;
            }

            const words = child.split(/([^\s]+)([\s]|$)/g).filter(f => f !== '');

            let s = '';
            for (const word of words) {
                const isemote = /:(.*?):/g.exec(word);
                if (!isemote) {
                    s += word;
                    continue;
                }

                const emote = this.findByName(isemote[1]);
                if (!emote) {
                    s += word;
                    continue;
                }

                newMarkup.push(s);
                s = '';

                emote.jumboable = jumboable;
                newMarkup.push(emote.render());
            }
            if (s !== '') newMarkup.push(s);
        }

        return newMarkup;
    }

    async patchMessageContent() {
        const selector = `.${WebpackModules.getClassName('container', 'containerCozy', 'containerCompact', 'edited')}`;
        const MessageContent = await ReactComponents.getComponent('MessageContent', { selector });
        MonkeyPatch('BD:EMOTEMODULE', MessageContent.component.prototype).after('render', this.afterRenderMessageContent.bind(this));
        MessageContent.forceUpdateAll();
    }

    afterRenderMessageContent(component, args, retVal) {
        const markup = Utils.findInReactTree(retVal, filter =>
            filter &&
            filter.className &&
            filter.className.includes('markup') &&
            filter.children.length >= 2);

        if (!markup) return;
        markup.children[1] = this.processMarkup(markup.children[1]);
    }

    handleChannelTextAreaSubmit(component, args, retVal) {
        component.props.value = component.props.value.split(' ').map(word => {
            const isEmote = /;(.*?);/g.exec(word);
            return isEmote ? `:${isEmote[1]}:` : word;
        }).join(' ');
    }

    async loadLocalDb() {
        const emotes = await FileUtils.readJsonFromFile(this.dbpath);
        for (const [index, emote] of emotes.entries()) {
            const { type, id, src, value } = emote;
            if (index % 10000 === 0) await Utils.wait();

            this.database.set(id, { id: emote.value.id || value, type });
        }
    }

    findByName(name) {
        const emote = this.database.get(name);
        if (!emote) return null;
        return this.parseEmote(name, emote);
    }

    parseEmote(name, emote) {
        const { type, id } = emote;
        if (type < 0 || type > 2) return null;
        return new Emote(type, id, name);
    }

    search(regex, limit = 10) {
        if (typeof regex === 'string') regex = new RegExp(regex, 'i');
        const matching = [];

        for (const [key, value] of this.database.entries()) {
            if (matching.length >= limit) break;
            if (regex.test(key)) matching.push({ key, value })
        }

        return {
            actype: 'imagetext',
            items: matching.map(match => {
                match.value.src = EMOTE_SOURCES[match.value.type].replace(':id', match.value.id);
                match.value.replaceWith = `;${match.key};`;
                return match;
            })
        };
    }

}
