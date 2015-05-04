/**
 * Pileup visualization of BAM sources.
 * @flow
 */
'use strict';

import type * as SamRead from './SamRead';

var React = require('react/addons'),
    _ = require('underscore'),
    d3 = require('d3'),
    types = require('./types'),
    Interval = require('./Interval'),
    {addToPileup, getDifferingBasePairs} = require('./pileuputils');

var PileupTrack = React.createClass({
  propTypes: {
    range: types.GenomeRange,
    reads: React.PropTypes.array.isRequired,
    onRangeChange: React.PropTypes.func.isRequired,
    referenceSource: React.PropTypes.object.isRequired
  },
  render: function(): any {
    var range = this.props.range;
    if (!range) {
      return <EmptyTrack />;
    }

    return <NonEmptyPileupTrack {...this.props} />;
  }
});


var READ_HEIGHT = 13;
var READ_SPACING = 2;  // vertical pixels between reads

var READ_STRAND_ARROW_WIDTH = 6;

// Returns an SVG path string for the read, with an arrow indicating strand.
function makePath(scale, visualRead: VisualAlignment) {
  var read = visualRead.read,
      left = scale(visualRead.read.pos),
      top = 0,
      right = scale(read.pos + visualRead.refLength) - 5,
      bottom = READ_HEIGHT,
      path = visualRead.strand == Strand.POSITIVE ? [
        [left, top],
        [right - READ_STRAND_ARROW_WIDTH, top],
        [right, (top + bottom) / 2],
        [right - READ_STRAND_ARROW_WIDTH, bottom],
        [left, bottom]
      ] : [
        [right, top],
        [left + READ_STRAND_ARROW_WIDTH, top],
        [left, (top + bottom) / 2],
        [left + READ_STRAND_ARROW_WIDTH, bottom],
        [right, bottom]
      ];
  return d3.svg.line()(path);
}

function readClass(vread: VisualAlignment) {
  return 'alignment ' + (vread.strand == Strand.NEGATIVE ? 'negative' : 'positive');
}

// Copied from pileuputils.js
type BasePair = {
  pos: number;
  basePair: string;
}

// This bundles everything intrinsic to the alignment that we need to display
// it, i.e. everything not dependend on scale/viewport.
type VisualAlignment = {
  key: string;
  read: SamRead;
  strand: number;  // see Strand below
  row: number;  // pileup row.
  refLength: number;  // span on the reference (accounting for indels)
  mismatches: Array<BasePair>;
};
var Strand = {
  POSITIVE: 0,
  NEGATIVE: 1
};

// TODO: scope to PileupTrack
var pileup = [];
var keyToVisualAlignment: {[key:string]: VisualAlignment} = {};

// Attach visualization info to the read and cache it.
function addRead(read: SamRead, referenceSource): VisualAlignment {
  var k = read.offset.toString();
  var v = keyToVisualAlignment[k];
  if (v) return v;

  var refLength = read.getReferenceLength();
  var range = read.getInterval();
  var reference = referenceSource.getRangeAsString({
     contig: 'chr' + range.contig,
     start: range.start() + 1,  // why the +1?
     stop: range.stop() + 1
  });

  var key = read.offset.toString();

  var visualAlignment = {
    key,
    read,
    strand: read.getStrand() == '+' ? Strand.POSITIVE : Strand.NEGATIVE,
    row: addToPileup(new Interval(read.pos, read.pos + refLength), pileup),
    refLength,
    mismatches: getDifferingBasePairs(read, reference)
  };

  keyToVisualAlignment[k] = visualAlignment;
  return visualAlignment;
}

function yForRow(row) {
  return row * (READ_HEIGHT + READ_SPACING);
}

class NonEmptyPileupTrack extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      width: 0,
      height: 0
    };
  }

  render(): any {
    return <div className='pileup'></div>;
  }

  componentDidMount() {
    var div = React.findDOMNode(this);
    this.setState({
      width: div.offsetWidth,
      height: div.offsetWidth
    });
    d3.select(div)
      .append('svg');
    this.updateVisualization();
  }

  getScale() {
    var range = this.props.range,
        width = this.state.width,
        offsetPx = range.offsetPx || 0;
    var scale = d3.scale.linear()
            .domain([range.start, range.stop + 1])  // 1 bp wide
            .range([-offsetPx, width - offsetPx]);
    return scale;
  }

  componentDidUpdate(prevProps: any, prevState: any) {
    // Check a whitelist of properties which could change the visualization.
    // TODO: this is imprecise; it would be better to deep check reads.
    var newProps = this.props;
    if (!_.isEqual(newProps.reads, prevProps.reads) ||
        !_.isEqual(newProps.range, prevProps.range) ||
       prevState != this.state) {
      this.updateVisualization();
    }
  }

  updateVisualization() {
    var div = React.findDOMNode(this),
        width = this.state.width,
        height = this.state.height,
        svg = d3.select(div).select('svg');

    // Hold off until height & width are known.
    if (width === 0) return;

    var referenceSource = this.props.referenceSource;
    var vReads = this.props.reads.map(read => addRead(read, referenceSource));

    var scale = this.getScale();

    svg.attr('width', width)
       .attr('height', height);

    var reads = svg.selectAll('.alignment')
       .data(vReads, vRead => vRead.key);

    // Enter
    var readsG = reads.enter()
        .append('g')
        .attr('class', readClass)
        .attr('transform', vRead => `translate(0, ${yForRow(vRead.row)})`)
        .on('click', vRead => {
          window.alert(vRead.read.debugString());
        });

    readsG.append('path');  // the alignment arrow
    readsG.selectAll('text.basepair')
        .data(vRead => vRead.mismatches)
        .enter()
        .append('text')
          .attr('class', mismatch => 'basepair ' + mismatch.basePair)
          .text(mismatch => mismatch.basePair);

    // Update
    reads.select('path').attr('d', (read, i) => makePath(scale, read));
    reads.selectAll('text').attr('x', mismatch => scale(mismatch.pos));

    // Exit
    reads.exit().remove();
  }

}

NonEmptyPileupTrack.propTypes = {
  range: types.GenomeRange.isRequired,
  reads: React.PropTypes.array.isRequired,
  referenceSource: React.PropTypes.object.isRequired,
  onRangeChange: React.PropTypes.func.isRequired
};


var EmptyTrack = React.createClass({
  render: function() {
    return <div className='pileup empty'>Zoom in to see alignments</div>;
  }
});

module.exports = PileupTrack;
