/**
 * Implementation of tracking plugin.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2020)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { css, customElement, html, property} from 'lit-element';
import '@material/mwc-icon-button';
import '@material/mwc-icon-button-toggle';
import '@material/mwc-button';
import '@material/mwc-select';
import '@material/mwc-list/mwc-list.js';
import '@material/mwc-list/mwc-list-item.js';
import '@material/mwc-dialog';
import '@material/mwc-list/mwc-list-item';
import { mergeTracks as mergeTracksIcon, cutTrack } from '@pixano/core/lib/style';
import { Rectangle } from './pxn-rectangle'
import { ShapeData, TrackData } from './types';
import { getShape,
    convertShapes,
    setKeyShape,
    isKeyShape,
    deleteShape,
    removeOrAddKeyShape,
    switchVisibility,
    switchTrack,
    trackColors,
    splitTrack,
    getNewTrackId,
    mergeTracks,
    getClosestFrames } from './utils-video';
import { ShapesEditController } from './controller';
// import { TrackingSmartController } from './controller-tracking';
import { ClickController } from "./controller-tracking";
import { style2d } from './style';


@customElement('pxn-tracking' as any)
export class Tracking extends Rectangle {

    @property({type: Object})
    public tracks: {[key: string]: TrackData} = {};

    displayMode: 'show_all' | 'show_selected' = 'show_all';

    @property({ type: Object })
    public selectedTrackIds: Set<string> = new Set();

    categories: any[] = [
        { name: 'person', color: "#eca0a0", properties: [
            {name: 'posture', type: 'dropdown', enum: ['straight', 'inclined', 'squat', 'sit'], persistent: false, default: 'straight'},
            {name: 'occlusion', type: 'dropdown', enum: [0, 0.25, 0.50, 0.75], persistent: false, default: 0}
        ]},
        { name: 'car', color: "green", properties: [] }
    ];

    static get styles() {
        return [
            ...style2d,
            css`
            .new-button {
                --mdc-theme-primary: #9C27B0;
            }
            .card {
                box-shadow: rgba(0, 0, 0, 0.2) 0px 1px 3px 0px;
                border-radius: 5px;
                width: 300px;
                background: white;
                margin-top: 20px;
                --mdc-icon-size: 20px;
            }
            .item {
                display: flex;
                margin-top: 10px;
                border-bottom: 1px solid #e2e2e2;
            }
            .item mwc-icon-button,mwc-icon-button-toggle {
                width: 40px;
            }
            .item > p {
                margin: 10px;
                align-items: center;
                display: flex;
            }
            .card > p {
                padding: 20px 0px 20px 20px;
                font-weight: bold;
                background: #f9f9f9;
                margin: 0;
            }
            .dot {
                height: 15px;
                width: 15px;
                background-color: #bbb;
                border-radius: 50%;
                display: inline-block;
                margin-top: 44px;
              }
        `];
    }

    constructor() {
        super();
        this.addEventListener('timestamp', () => {
            this.drawTracks();
        });
        this.addEventListener('create', (e) => {
            // if there is a selected track, add keyshape
            // else create a new track
            if (this.selectedTrackIds.size) {
                const currentTrackId = this.selectedTrackIds.values().next().value;
                this.addNewKeyShapes([
                  {
                    ...JSON.parse(JSON.stringify((e as any).detail)),
                    id: currentTrackId
                  }
                ]);
            } else {
                this.newTrack(e);
            }
            //this.newTrack(e);
        });
        this.addEventListener('update-tracks', () => {
            this.drawTracks();
            this.requestUpdate();
        });
        this.addEventListener('selection-track', () => {
            this.requestUpdate();
        });
        this.addEventListener('delete-track', () => {
            this.selectedTrackIds.clear();
            this.drawTracks();
            this.requestUpdate();
        });
        this.addEventListener('update', () => {
            // when updating instance, create or edit keyshape
            this.addNewKeyShapes([...this.targetShapes]);

        });
        this.addEventListener('selection', () => {
            // unselect track is shape is unselected
            if (!this.targetShapes.size) {
                this.selectedTrackIds.clear();
                this.dispatchEvent(new CustomEvent('selection-track', { detail : this.selectedTrackIds}));
            }

        });
        this.addEventListener('delete', (evt: any) => {
            const ids = evt.detail;
            ids.forEach((id: string) => {
                if (isKeyShape(this.tracks[id], this.timestamp)) {
                    deleteShape(this.tracks[id], this.timestamp);
                }
            });
            // if track is empty remove it ?

            this.dispatchEvent(new CustomEvent('update-tracks', { detail: Object.values(this.tracks) }));
            this.drawTracks();
        });
        window.addEventListener('keydown', (evt) => {
            if (evt.key === "r") {
                this.mergeTracks(this.selectedTrackIds);
            }
        });
        this.handleTrackSelection();
        this.setController('point', new ClickController({renderer: this.renderer,shapes: this.shapes, dispatchEvent: this.dispatchEvent}));
        // this.setController('tracking', new TrackingSmartController({renderer: this.renderer, targetShapes: this.targetShapes, dispatchEvent: this.dispatchEvent, nextFrame: this.nextFrame.bind(this)}))
    }

    /**
     * Extend shape controller onObjectDown to handle track selection
     */
    protected handleTrackSelection() {
        const editController = (this.modes.edit as ShapesEditController);
        editController.doObjectSelection = (shape: ShapeData, isShiftKey: boolean = false) => {
            const firstClick = ShapesEditController.prototype.doObjectSelection.call(editController, shape, isShiftKey);
            const trackId = shape.id;
            if (isShiftKey) {
                if (!this.selectedTrackIds.has(trackId)) {
                    this.selectedTrackIds.add(trackId);
                    this.dispatchEvent(new CustomEvent('selection-track', { detail : this.selectedTrackIds }));
                }
            } else if (!this.selectedTrackIds.has(trackId)) {
                this.selectedTrackIds.clear();
                this.selectedTrackIds.add(trackId);
                this.dispatchEvent(new CustomEvent('selection-track', { detail : this.selectedTrackIds}));
            }
            return firstClick;
        }
        editController.onRootDown = (evt: any) => {
            if (evt.data.originalEvent.button === 2 || evt.data.originalEvent.button === 1) {
                return;
            }
            if (this.selectedTrackIds.size) {
                this.selectedTrackIds.clear();
                this.targetShapes.clear();
                this.dispatchEvent(new CustomEvent('selection-track', { detail : this.selectedTrackIds}));
            }
        }
    }

    /**
     * Called on every property change
     * @param changedProperty
     */
    protected updated(changedProperties: any) {
        super.updated(changedProperties);
        if (changedProperties.has('tracks')) {
            // Called when we initialize the tracks for the first time
            this.drawTracks();
        }
    }

    drawTracks() {
        this.shapes = this.convertShapes(this.timestamp) as any;
        // update selection to be displayed
        const selectedIds = [...this.selectedTrackIds]; 
        this.selectedShapeIds = selectedIds;
    }

    /**
     * Get rectangle shapes from specific frame
     * @param fIdx
     */
    convertShapes(timestamp: number): ShapeData[] {
        const tracks = this.displayMode === 'show_all' ?
                this.tracks : [...this.selectedTrackIds].reduce((map, id) => ({...map, [id]: this.tracks[id]}), {});
        return convertShapes(tracks, timestamp);
    }

    newTrack(e: any) {
        const newTrackId = getNewTrackId(this.tracks);
        const newShape = e.detail as ShapeData;
        newShape.id = newTrackId;
        newShape.color = trackColors[parseInt(newTrackId) % trackColors.length];
        const cls = this.categories[0].name;
        const keyShape = {
            geometry: newShape.geometry,
            timestamp: this.timestamp,
            labels: this.getDefaultProperties(cls)
        };
        const newTrack = {
            id: newTrackId,
            keyShapes: {[this.timestamp] : keyShape},
            category: cls,
            labels: {}
        };
        this.tracks[newTrackId] = newTrack;
        this.selectedTrackIds.clear();
        this.selectedTrackIds.add(newTrackId);
        this.selectedShapeIds = [newTrack.id];
        this.drawTracks();
        this.dispatchEvent(new CustomEvent('create-track', { detail: newTrack }));
        this.requestUpdate();
        // this.mode = 'edit';
    }

    /**
     * Split track into two tracks
     * @param t
     */
    splitTrack(tId: string) {
        const newTrack = splitTrack(tId, this.timestamp, this.tracks);
        this.selectedTrackIds.clear();
        this.selectedTrackIds.add(newTrack.id);
        this.dispatchEvent(new Event('update-tracks'));
    }

    /**
     * Merge two tracks.
     * If they do not overlap, do concatenation of keyshapes.
     * If they overlap at current timestamp, cut both tracks at timestamp and join the older left-side sub-track
     *    with the newer right-side sub-track. Create tracks with remaining sub-tracks.
     * If they overlap but not at current time, do as above with the first timestamp of overlap.
     * @param tracks tracks to be merged
     */
    mergeTracks(tracks: Set<string>) {
        if (tracks.size !== 2) {
            return;
        }
        const [t1Id, t2Id] = [...tracks];
        var mergedTrackId = mergeTracks(this.tracks, t1Id, t2Id, this.timestamp);
        this.selectedTrackIds.clear();
        this.selectedTrackIds.add(mergedTrackId);
        this.dispatchEvent(new Event('update-tracks'));
    }

    /**
     * Switch two tracks at given timestamp.
     * @param trackIds tracks to be switched
     */
    switchTrack(trackIds: Set<string>) {
        if (trackIds.size === 2) {
            const [t1Id, t2Id] = [...trackIds]
            switchTrack(this.tracks, t1Id, t2Id, this.timestamp);
            this.dispatchEvent(new Event('update-tracks'));
        }
    }

    /**
     * Enable or disable interpolation for the current frame
     */
    switchVisibility(t: TrackData) {
        switchVisibility(this.tracks[t.id], this.timestamp);
        this.dispatchEvent(new Event('update-tracks'));
    }

    addNewKeyShapes(shapes: ShapeData[]) {
        shapes.forEach((s) => {
            const tId = [...this.selectedTrackIds].find((id) => id === s.id);
            if (tId) {
                setKeyShape(this.tracks[tId], this.timestamp, {...getShape(this.tracks[tId], this.timestamp).keyshape!, ...s});
            }
        });
        this.dispatchEvent(new CustomEvent('update-tracks', { detail: Object.values(this.tracks) }));
        this.requestUpdate();
    }

    /**
     * Remove keyshape from track
     * @param t
     */
    removeOrAddKeyShape(t: TrackData) {
        removeOrAddKeyShape(this.tracks[t.id], this.timestamp);
        this.dispatchEvent(new CustomEvent('update-tracks', {detail: this.tracks}));
    }

    getDefaultPermProps(categoryName: string) {
        const category = this.categories.find((c) => c.name === categoryName);
        if (category) {
            const permProps: {[key: string]: any} = {};
            category!.properties.forEach((p: any) => {
                if (p.persistent)
                    permProps[p.name] = p.default
            })
            return permProps;
        }
        return {};
    }

    getDefaultProperties(categoryName: string) {
        const category = this.categories.find((c) => c.name === categoryName);

        const permProps: {[key: string]: any} = {};
        category!.properties.forEach((p: any) => {
            if (!p.persistent)
                permProps[p.name] = p.default;
        })
        return permProps;
    }

    /**
     * Set class (category) of the selected track
     * @param cls new class
     */
    setClass(t: TrackData, cls: string) {
        t.category = cls;
        t.labels = this.getDefaultProperties(cls);
        const defaultProp = this.getDefaultProperties(t.category);
        for (const [ , ks ] of Object.entries(t.keyShapes)) {
            ks.labels = {...defaultProp};
        }
        this.dispatchEvent(new CustomEvent('update-tracks', {detail: this.tracks}));
        this.requestUpdate();
    }

    /**
     * Set property of the selected track
     * @param cls new class
     */
    setProperty(t: TrackData, propName: string, propValue: any) {
        const shape = getShape(t, this.timestamp).keyshape;
        if (shape && shape.labels[propName] !== propValue) {
            shape.labels[propName] = propValue;
            setKeyShape(this.tracks[t.id], this.timestamp, {...shape});
            this.dispatchEvent(new CustomEvent('update-tracks', {detail: this.tracks}));
            this.requestUpdate();
        }
    }

    deleteTrack(tId: string) {
        const t = this.tracks[tId];
        delete this.tracks[tId];
        this.dispatchEvent(new CustomEvent('delete-track', {detail: t}));
    }

    /**
     * Go to previous keyframe for a given track
     * @param t
     */
    goToPreviousKeyFrame(t: TrackData) {
        const [prev,] = getClosestFrames(t, this.timestamp);
        if (prev >= 0) {
            this.timestamp = prev;
        }
    }

    /**
     * Go to next keyframe for a given track
     * @param t
     */
    goToNextKeyFrame(t: TrackData) {
        const [,next] = getClosestFrames(t, this.timestamp);
        if (isFinite(next)) {
            this.timestamp = next;
        }
    }

    /**
     * Open track delete confirmation pop-up
     * @param tId track id
     */
    askDeleteTrack(tId: string) {
        this.dialog.heading = tId;
        this.dialog.open = true;
    }

    /**
     * Return HTML dialog element
     */
    protected get dialog(): any {
        return this.shadowRoot!.getElementById("dialog") as any;
    }

    htmlProperty(prop: any, t: TrackData) {
        const shape = getShape(t, this.timestamp).keyshape;
        if (shape && prop.type === 'dropdown') {
            const value = shape.labels[prop.name];
            return html`
            <mwc-select id="${t.id}-${prop.name}" label="${prop.name}" @action=${(evt: any) => this.setProperty(t, prop.name, prop.enum[evt.detail.index])}>
            ${prop.enum.map((v: any) => {
                return html`<mwc-list-item value="${v}" ?selected="${v === value}">${v}</mwc-list-item>`
            })}
            </mwc-select>
            `
        }
        return html``;
    }

    /**
     * Display information tile of selected tracks
     * @param t track item
     */
    get selectionSection() {
        return html`
        <div class="card">
            <p style="display: inline-flex; width: -webkit-fill-available; height: 20px;">
                <span>Selected tracks</span>
                <span style="display: inline-flex; align-items: center;">${this.selectedTrackIds.size === 2 ? html`
                    <mwc-icon-button title="Switch track" @click=${() => this.switchTrack(this.selectedTrackIds)} icon="shuffle"></mwc-icon-button>
                    <mwc-icon-button title="Merge track" @click=${() => this.mergeTracks(this.selectedTrackIds)}>${mergeTracksIcon}</mwc-icon-button>` : ``}
                </span>
            </p>
            <div>
                ${[...this.selectedTrackIds].map((tId) => {
                    const t = this.tracks[tId];
                    const currentShape = getShape(t, this.timestamp).keyshape;
                    const color = trackColors[parseInt(tId) % trackColors.length];
                    let isHidden = true;
                    const disabled = currentShape == null;
                    if (currentShape) {
                        isHidden = currentShape.isNextHidden === true && !isKeyShape(t, this.timestamp);
                    }
                    const categoryProps = this.categories.find((c) => c.name === t.category).properties || [];
                    return html`
                    <div class="item">
                        <p style="flex-direction: column; color: gray;">T${t.id.toString()}<span class="dot" style="background: ${color}"></span></p>
                        <div style="display: flex; flex-direction: column; width: 100%; margin-right: 10px;">
                            <mwc-select id="labels" outlined @action=${(evt: any) => this.setClass(t, this.categories[evt.detail.index].name)}>
                                ${this.categories.map((c) => html`<mwc-list-item value="${c.name}" ?selected="${c.name === t.category}">${c.name}</mwc-list-item>`)}
                            </mwc-select>
                            ${currentShape ? categoryProps.map((prop: any) => this.htmlProperty(prop, t)) : html``}
                            <div style="margin-left: auto; display: flex; justify-content: space-between;">
                                <mwc-icon-button-toggle title="Keyframe" id="keyshape" onIcon="star" offIcon="star_border" ?disabled=${disabled} ?on=${isKeyShape(t, this.timestamp)} @click=${() => this.removeOrAddKeyShape(t)}></mwc-icon-button-toggle>
                                <mwc-icon-button-toggle title="Hidden" id="hiddenKeyshape" ?on=${!isHidden} ?disabled=${disabled} @click=${() => this.switchVisibility(t)} onIcon="visibility" offIcon="visibility_off"></mwc-icon-button-toggle>
                                <mwc-icon-button title="Go to previous keyframe" @click=${() => this.goToPreviousKeyFrame(t)} icon="keyboard_arrow_left"></mwc-icon-button>
                                <mwc-icon-button title="Go to next keyframe" @click=${() => this.goToNextKeyFrame(t)} icon="keyboard_arrow_right"></mwc-icon-button>
                                <mwc-icon-button title="Split track" ?disabled=${disabled} @click=${() => this.splitTrack(t.id)}>${cutTrack}</mwc-icon-button>
                                <mwc-icon-button title="Delete entire track" icon="delete_forever" @click=${() => this.askDeleteTrack(t.id)}></mwc-icon-button>
                            </div>
                        </div>
                    </div>
                    `;
                })}
            </div>
        </div>
        `;
    }

    render() {
        return html`
        <div style="display: flex; height: 100%;">
            <div style="position: relative; min-width: 100px; width: 100%;">${super.render()}</div>
            <div style="flex: 0 0 300px; background: #f9f9f9; padding: 10px;">
                <mwc-button @click=${() => {this.selectedTrackIds.clear(); this.mode = 'create';}} icon="add"
                            class="new-button ${!this.selectedTrackIds.size ? 'fill': ''}"
                            style="width: 100%; flex-direction: column;">New</mwc-button>
                ${this.selectionSection}
            </div>
        </div>
        <mwc-dialog id="dialog">
            Remove track ? <br>
            WARNING: All its bounding boxes will be lost.
            </div>
            <mwc-button
                slot="primaryAction"
                dialogAction="ok"
                @click=${() => this.deleteTrack(this.dialog.heading)}>
                Ok
            </mwc-button>
            <mwc-button
                slot="secondaryAction"
                dialogAction="cancel">
                Cancel
            </mwc-button>
        </mwc-dialog>
        `;
      }
}