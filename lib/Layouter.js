import BPMNModdle from 'bpmn-moddle';
import { isBoundaryEvent, isConnection } from './utils/elementUtils.js';
import { Grid } from './Grid.js';
import { DiFactory } from './di/DiFactory.js';
import { is } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  POOL_LABEL_WIDTH,
  POOL_PADDING,
  POOL_SPACING,
  translateDi,
} from './utils/layoutUtil.js';

export class Layouter {
  constructor() {
    this.moddle = new BPMNModdle();
    this.diFactory = new DiFactory(this.moddle);
    this._handlers = handlers;
  }

  handle(operation, options) {
    return this._handlers
      .filter((handler) => isFunction(handler[operation]))
      .map((handler) => handler[operation](options));
  }

  async layoutProcess(xml) {
    const { rootElement } = await this.moddle.fromXML(xml);

    this.diagram = rootElement;

    /*
     * 1) collaboration present  -> layout pools & lanes
     * 2) no collaboration       -> keep old behaviour
     */

    const collaboration = this.getCollaboration();

    this.cleanDi();

    if (collaboration) {
      this.handleCollaboration(collaboration);

      // collaboration handled – nothing more to do
      return (await this.moddle.toXML(this.diagram, { format: true })).xml;
    }

    // legacy (single process, no pools)
    const root = this.getProcess();
    if (root) {
      this.handlePlane(root);
    }

    return (await this.moddle.toXML(this.diagram, { format: true })).xml;
  }

  handlePlane(planeElement) {
    const layout = this.createGridLayout(planeElement);
    this.generateDi(planeElement, layout);
  }

  cleanDi() {
    this.diagram.diagrams = [];
  }

  createGridLayout(root) {
    const grid = new Grid();

    const flowElements = root.flowElements || [];
    const elements = flowElements.filter((el) => !is(el, 'bpmn:SequenceFlow'));

    // check for empty process/subprocess
    if (!flowElements) {
      return grid;
    }

    const startingElements = flowElements.filter((el) => {
      return (
        !isConnection(el) &&
        !isBoundaryEvent(el) &&
        (!el.incoming || el.length === 0)
      );
    });

    const boundaryEvents = flowElements.filter((el) => isBoundaryEvent(el));
    boundaryEvents.forEach((boundaryEvent) => {
      const attachedTask = boundaryEvent.attachedToRef;
      const attachers = attachedTask.attachers || [];
      attachers.push(boundaryEvent);
      attachedTask.attachers = attachers;
    });

    // Depth-first-search
    const stack = [ ...startingElements ];
    const visited = new Set();

    startingElements.forEach((el) => {
      grid.add(el);
      visited.add(el);
    });

    this.handleGrid(grid, visited, stack);

    if (grid.getElementsTotal() != elements.length) {
      const gridElements = grid.getAllElements();
      const missingElements = elements.filter(
        (el) => !gridElements.includes(el) && !isBoundaryEvent(el)
      );
      if (missingElements.length > 1) {
        stack.push(missingElements[0]);
        grid.add(missingElements[0]);
        visited.add(missingElements[0]);
        this.handleGrid(grid, visited, stack);
      }
    }

    return grid;
  }

  generateDi(root, layoutGrid) {
    const diFactory = this.diFactory;

    // Step 0: Create Root element
    const diagram = this.diagram;

    var planeDi = diFactory.createDiPlane({
      id: 'BPMNPlane_' + root.id,
      bpmnElement: root,
    });
    var diagramDi = diFactory.createDiDiagram({
      id: 'BPMNDiagram_' + root.id,
      plane: planeDi,
    });

    // deepest subprocess is added first - insert at the front
    diagram.diagrams.unshift(diagramDi);

    const planeElement = planeDi.get('planeElement');

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this.handle('createElementDi', {
        element,
        row,
        col,
        layoutGrid,
        diFactory,
      }).flat();

      planeElement.push(...dis);
    });

    // Step 2: Create DI for all connections
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this.handle('createConnectionDi', {
        element,
        row,
        col,
        layoutGrid,
        diFactory,
      }).flat();

      planeElement.push(...dis);
    });
  }

  handleGrid(grid, visited, stack) {
    while (stack.length > 0) {
      const currentElement = stack.pop();

      if (is(currentElement, 'bpmn:SubProcess')) {
        this.handlePlane(currentElement);
      }

      const nextElements = this.handle('addToGrid', {
        element: currentElement,
        grid,
        visited,
        stack,
      });

      nextElements.flat().forEach((el) => {
        stack.push(el);
        visited.add(el);
      });
    }
  }

  /* ------------------------------------------------------------------
   *  collaboration  (pools & lanes)
   * ----------------------------------------------------------------*/

  handleCollaboration(collaboration) {
    const diFactory = this.diFactory;

    // ---------------------------------------------------------------
    // Step 0 – create plane / diagram for the **collaboration**
    // ---------------------------------------------------------------
    const planeDi = diFactory.createDiPlane({
      id: 'BPMNPlane_' + collaboration.id,
      bpmnElement: collaboration,
    });

    const diagramDi = diFactory.createDiDiagram({
      id: 'BPMNDiagram_' + collaboration.id,
      plane: planeDi,
    });

    this.diagram.diagrams.unshift(diagramDi);

    const planeElement = planeDi.get('planeElement');

    // ---------------------------------------------------------------
    // Step 1 – layout every participant's process individually
    // ---------------------------------------------------------------

    const participantLayouts = []; // data that poolLaneHandler consumes
    let verticalCursor = 0; // keeps track of current y-offset

    collaboration.participants.forEach((participant) => {
      const process = participant.processRef;

      // empty pool – give it some default size and continue
      if (
        !process ||
        !process.flowElements ||
        process.flowElements.length === 0
      ) {
        const width = 400;
        const height = 150;

        participantLayouts.push({
          participant,
          lanes: [],
          x: 100,
          y: verticalCursor,
          width,
          height,
        });

        verticalCursor += height + POOL_SPACING;
        return;
      }

      // ------------------------------------------------------------
      //  remember which flow node belongs to which lane
      //  The information is stored on the elements themselves
      //  so every handler has access to it afterwards.
      // ------------------------------------------------------------ //
      let laneIdx = 0;
      (process.laneSets || []).forEach((ls) => {
        (ls.lanes || []).forEach((l) => {
          l.__laneIndex = laneIdx;
          (l.flowNodeRef || []).forEach((n) => (n.__laneIndex = laneIdx));
          laneIdx++;
        });
      });

      // ---------------- grid & element DI ---------------------------
      const grid = this.createGridLayout(process);
      const [ rows, cols ] = grid.getGridDimensions();

      // size of the *area* the flow nodes occupy
      const areaWidth = Math.max(cols, 1) * DEFAULT_CELL_WIDTH;
      const areaHeight = Math.max(rows, 1) * DEFAULT_CELL_HEIGHT;

      // Where do we place the very first cell of that process?
      // If the process contains lanes we do **not** add any extra
      // padding – otherwise we keep the previous behaviour.
      const hasLanes = (process.laneSets || []).some(
        (ls) => (ls.lanes || []).length
      );

      const innerPadding = hasLanes ? 0 : POOL_PADDING;

      const offsetX = innerPadding + POOL_LABEL_WIDTH + 100; // 100px left margin
      const offsetY = verticalCursor + innerPadding;

      // create node / edge DI for that process
      this.generateGridDi({
        grid,
        offset: { dx: offsetX, dy: offsetY },
        planeElement,
        diFactory,
      });

      // ---------------- lanes (if any) ------------------------------
      const lanes = [];

      (process.laneSets || []).forEach((laneSet) => {
        (laneSet.lanes || []).forEach((lane) => {

          // rows the lane actually uses
          const rowsInLane = (lane.flowNodeRef || [])
            .map((n) => grid.find(n)[0])
            .filter((r) => r >= 0);

          const minRow = rowsInLane.length ? Math.min(...rowsInLane) : 0;
          const maxRow = rowsInLane.length ? Math.max(...rowsInLane) : 0;

          lanes.push({
            lane,
            y: offsetY + minRow * DEFAULT_CELL_HEIGHT,
            height:
              (maxRow - minRow + 1) * DEFAULT_CELL_HEIGHT ||
              DEFAULT_CELL_HEIGHT,
          });
        });
      });

      // complete pool (participant) dimensions
      const poolWidth = areaWidth + 2 * innerPadding + POOL_LABEL_WIDTH;
      const poolHeight =
        Math.max(
          lanes.reduce((h, l) => h + l.height, 0), // lanes combined
          areaHeight // or bare area
        ) +
        2 * innerPadding;

      participantLayouts.push({
        participant,
        lanes,
        x: 100,
        y: verticalCursor,
        width: poolWidth,
        height: poolHeight,
      });

      verticalCursor += poolHeight + POOL_SPACING;
    });

    // ---------------------------------------------------------------
    // Step 2 – create BPMNDI for *participants* and *lanes*
    // ---------------------------------------------------------------
    this.handle('createPoolsAndLanesDi', {
      diFactory,
      planeElement,
      participantLayouts,
    });
  }

  /* ------------------------------------------------------------------
   *  helper – generate DI for ONE already laid-out grid
   * ----------------------------------------------------------------*/

  generateGridDi({ grid, offset, planeElement, diFactory }) {
    const localDis = [];

    // 1) flow nodes
    grid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this.handle('createElementDi', {
        element,
        row,
        col,
        layoutGrid: grid,
        diFactory,
      }).flat();

      localDis.push(...dis);
      planeElement.push(...dis);
    });

    // 2) connections
    grid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this.handle('createConnectionDi', {
        element,
        row,
        col,
        layoutGrid: grid,
        diFactory,
      }).flat();

      localDis.push(...dis);
      planeElement.push(...dis);
    });

    // 3) shift everything into its pool area
    localDis.forEach((di) => translateDi(di, offset));
  }

  getProcess() {
    return (this.diagram.rootElements || []).find(
      (el) => el.$type === 'bpmn:Process'
    );
  }

  getCollaboration() {
    const rootEls =
      this.diagram.rootElements ||
      (this.diagram.get && this.diagram.get('rootElements')) ||
      [];

    return rootEls.find((el) => el.$type === 'bpmn:Collaboration');
  }
}
