/**
 * Pixano 2d-graphics elements.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { Polygon } from './pxn-polygon';
import { Rectangle } from './pxn-rectangle';
import { Segmentation } from './pxn-segmentation';
import { Graph } from './pxn-graph';
import { SmartRectangle } from './pxn-smart-rectangle';
import { Tracking } from './pxn-tracking';
import { SmartSegmentation } from './pxn-smart-segmentation';

export { Graph, Polygon, Rectangle, Segmentation, SmartRectangle, Tracking, SmartSegmentation };

declare global {
  interface HTMLElementTagNameMap {
    'pxn-polygon': Polygon;
    'pxn-rectangle': Rectangle;
    'pxn-segmentation': Segmentation;
    'pxn-graph': Graph;
    'pxn-smart-rectangle': SmartRectangle;
    'pxn-tracking': Tracking;
    'pxn-smart-segmentation': SmartSegmentation;
  }
}
