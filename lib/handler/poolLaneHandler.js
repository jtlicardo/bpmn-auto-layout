// Responsible for creating BPMNDI for pools (participants) and lanes.
// No grid manipulation required – everything happens *after* the flows
// have been laid out.

import {
  POOL_LABEL_WIDTH,
} from '../utils/layoutUtil.js';

export default {

  /**
   * Called from the Layouter *once per collaboration*
   */
  createPoolsAndLanesDi: ({
    diFactory,
    planeElement,
    participantLayouts
  }) => {

    participantLayouts.forEach(pl => {

      // ------------------------------------------------------------------
      // Pool (participant) shape
      // ------------------------------------------------------------------
      const participantBounds = {
        x: pl.x,
        y: pl.y,
        width : pl.width,
        height: pl.height
      };

      const poolDi = diFactory.createDiShape(
        pl.participant,
        participantBounds,
        { id:  pl.participant.id + '_di', isHorizontal: true }
      );

      // a label stub – makes sure Modeler shows the name
      poolDi.set('label', diFactory.createDiLabel());

      planeElement.push(poolDi);

      // ------------------------------------------------------------------
      // Lane shapes (if any)
      // ------------------------------------------------------------------
      (pl.lanes || []).forEach(l => {

        const laneBounds = {
          x: participantBounds.x + POOL_LABEL_WIDTH,
          y: l.y,
          width : participantBounds.width - POOL_LABEL_WIDTH,
          height: l.height
        };

        const laneDi = diFactory.createDiShape(
          l.lane,
          laneBounds,
          { id: l.lane.id + '_di', isHorizontal: true }
        );

        laneDi.set('label', diFactory.createDiLabel());
        planeElement.push(laneDi);
      });
    });

    // nothing to return – we already modified the plane
  }
};