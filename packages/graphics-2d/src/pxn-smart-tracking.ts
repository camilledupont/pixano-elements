/**
 * Implementation of tracking plugin.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2020)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { customElement, html, property} from 'lit-element';
import { Tracking } from './pxn-tracking'
import { Tracker } from '@pixano/ai/lib/tracker';
import { track } from '@pixano/core/lib/style';
import '@material/mwc-switch';


@customElement('pxn-smart-tracking' as any)
export class SmartTracking extends Tracking {

	// smart tracker
	private tracker = new Tracker();

	@property({type: Boolean})
	public isTrackTillTheEndChecked: boolean = true;

	@property({type: String})
	public model: string = 'https://raw.githubusercontent.com/pixano/pixano.github.io/master/models/track_model/model.json';

	constructor() {
		super();
		// events specific to smart-tracking
		window.addEventListener('keydown', (evt) => {
			if (evt.key === 't') {
				this.runTracking();
			}
		});
	}

	runTracking() {
		if (this.isTrackTillTheEndChecked) this.trackTillTheEnd();
		else this.trackTillNextFrame();
	}

	updated(changedProperties: any) {
		super.updated(changedProperties);
		if (changedProperties.has('model')) {
			// load the model
			this.renderer.renderer.plugins.interaction.cursorStyles.default = 'wait';
			this.tracker.loadModel(this.model).then(() => {
				this.renderer.renderer.plugins.interaction.cursorStyles.default = 'inherit';
				this.renderer.renderer.plugins.interaction.currentCursorMode = "inherit";
			});
		}
	}

	protected delay(ms: number) {
		return new Promise(function (resolve) { return setTimeout(resolve, ms); });
	};

	async trackTillTheEnd() {
		let stopTracking = false;
		let initIdx = this.frameIdx;
		const stopTrackingListenerFct = function stopTrackingListener (evt: KeyboardEvent) {
			if (evt.key === 'Escape') {
				stopTracking = true;
			}
		}
		window.addEventListener('keydown', stopTrackingListenerFct);
		while (!stopTracking && !this.isLastFrame()) {
			// update target template every 5 frames
			const resetTemplate = (this.frameIdx-initIdx)%5 == 0;
			await this.trackTillNextFrame(resetTemplate);
		}
		// back to edit mode after each new creation
		this.mode = 'edit';

		window.removeEventListener('keydown', stopTrackingListenerFct);
	}

	protected async trackTillNextFrame(resetTemplate: boolean = true) {
		/// process the selected shape
		if (this.targetShapes.size>1) {
			console.log("ABORT: we can only track one shape at a time")
			return;
		}

		if (resetTemplate) {
			const target = this.targetShapes.values().next().value;
			/// get the shape to track
			const v: number[] = target.geometry.vertices;
			const xmin = Math.min(v[0], v[2]);
			const xmax = Math.max(v[0], v[2]);
			const ymin = Math.min(v[1], v[3]);
			const ymax = Math.max(v[1], v[3]);
			/// pre-processing
			const im0 = this.renderer.image; //await resizeImage(this.renderer.image, 200);
			const x = Math.round(xmin*im0.width);
			const y = Math.round(ymin*im0.height);
			const w = Math.round(xmax*im0.width) - x;
			const h = Math.round(ymax*im0.height) - y;
			this.tracker.initBox(im0, x, y, w, h);
		}

		/// processing
		let im1 = await (this.loader as any).peekFrame(this.frameIdx+1);
		// im1 = await resizeImage(im1, 200);
		var res = this.tracker.run(im1);
		await this.nextFrame()

		/// get calculated shape and take it as the new shape
		const target = this.targetShapes.values().next().value;
		target.geometry.vertices = [
			res[0]/im1.width,
			res[1]/im1.height,
			(res[0]+res[2])/im1.width,
			(res[1]+res[3])/im1.height
		];
		this.dispatchEvent(new Event('update'));
		await this.delay(10);
	}

	// overide leftPanel to add tracking properties
	get leftPanel() {
		const checked = this.isTrackTillTheEndChecked;
		return html`
		<div>
			${super.leftPanel}
			<mwc-icon-button title="Auto track (t)"
							@click=${() => this.runTracking()}>${track}</mwc-icon-button>
			<div class="card">
				<p>Continuous tracking
				<mwc-switch ?checked=${checked}
								title="track ones / track till the end (escape to stop tracking)"
								@change=${ () => { this.isTrackTillTheEndChecked = !this.isTrackTillTheEndChecked; } }
								></mwc-switch></p>
			</div>
		</div>
		`;
	}
}


// export function resizeImage(img: HTMLImageElement, targetWidth: number=400): Promise<HTMLImageElement> {
// 	return new Promise((resolve) => {
// 		const canvas = document.createElement("canvas");
// 		const context = canvas.getContext("2d")!;
	
// 		const originalWidth = img.width;
// 		const originalHeight = img.height;
	
// 		const canvasWidth = targetWidth;
// 		const canvasHeight = originalHeight * targetWidth / originalWidth;
	
// 		canvas.width = canvasWidth;
// 		canvas.height = canvasHeight;
	
// 		context.drawImage(
// 			img, 0, 0, targetWidth, canvasHeight
// 		);
// 		const newImg = new Image();
// 		newImg.onload = () => {
// 			resolve(newImg);
// 		};
// 		newImg.src = canvas.toDataURL();
// 	})
// }
