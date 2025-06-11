import { connectElements } from '../utils/layoutUtil.js';
import { is } from '../di/DiUtil.js';
import { findElementInTree } from '../utils/elementUtils.js';

export default {
  addToGrid: ({ element, grid, visited, stack }) => {
    let nextElements = [];

    // Handle outgoing paths
    const outgoing = (element.outgoing || [])
      .map((out) => out.targetRef)
      .filter((el) => el);

    let previousElement = null;

    if (outgoing.length > 1 && isNextElementTasks(outgoing)) {
      grid.adjustGridPosition(element);
    }

    outgoing.forEach((nextElement, index, arr) => {
      if (visited.has(nextElement)) {
        return;
      }

      if (
        (previousElement || stack.length > 0) &&
        isFutureIncoming(nextElement, visited) &&
        !checkForLoop(nextElement, visited)
      ) {
        return;
      }

      const srcLane = element.__laneIndex ?? 0; // << lane-layout
      const tgtLane = nextElement.__laneIndex ?? srcLane; // << lane-layout

      /* ----------------------------------------------------
       *  Same lane  -> behave like before
       *  Downwards  -> put element in a new row (addBelow)
       *  Upwards    -> continue in the *last* row of that
       *                (already visited) upper lane
       * --------------------------------------------------*/
      if (tgtLane === srcLane) {
        if (!previousElement) {
          grid.addAfter(element, nextElement);
        } else if (
          is(element, 'bpmn:ExclusiveGateway') &&
          is(nextElement, 'bpmn:ExclusiveGateway')
        ) {
          grid.addAfter(previousElement, nextElement);
        } else {
          grid.addBelow(arr[index - 1], nextElement);
        }
      } else if (tgtLane > srcLane) {

        // lane change downwards
        grid.addBelow(element, nextElement); // << lane-layout
      } else {

        // lane change upwards
        const anchor = grid.getLastElementForLane(tgtLane); // << lane-layout
        if (anchor) {


          grid.addAfter(anchor, nextElement); // << lane-layout
        } else {


          grid.addBelow(element, nextElement); // fallback (should not happen) // << lane-layout
        }
      }

      grid.setLastElementForLane(tgtLane, nextElement); // keep book

      if (nextElement !== element) {
        previousElement = nextElement;
      }

      nextElements.unshift(nextElement);
      visited.add(nextElement);
    });

    // Sort elements by priority to ensure proper stack placement
    nextElements = sortByType(nextElements, 'bpmn:ExclusiveGateway'); // TODO: sort by priority
    return nextElements;
  },

  createConnectionDi: ({ element, row, col, layoutGrid, diFactory }) => {
    const outgoing = element.outgoing || [];

    return outgoing.map((out) => {
      const target = out.targetRef;
      const waypoints = connectElements(element, target, layoutGrid);

      const connectionDi = diFactory.createDiEdge(out, waypoints, {
        id: out.id + '_di',
      });

      return connectionDi;
    });
  },
};

// helpers /////

function sortByType(arr, type) {
  const nonMatching = arr.filter((item) => !is(item, type));
  const matching = arr.filter((item) => is(item, type));

  return [ ...matching, ...nonMatching ];
}

function checkForLoop(element, visited) {
  for (const incomingElement of element.incoming) {
    if (!visited.has(incomingElement.sourceRef)) {
      return findElementInTree(element, incomingElement.sourceRef);
    }
  }
}

function isFutureIncoming(element, visited) {
  if (element.incoming.length > 1) {
    for (const incomingElement of element.incoming) {
      if (!visited.has(incomingElement.sourceRef)) {
        return true;
      }
    }
  }
  return false;
}

function isNextElementTasks(elements) {
  return elements.every((element) => is(element, 'bpmn:Task'));
}
