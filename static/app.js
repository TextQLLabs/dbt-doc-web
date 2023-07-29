const userInput = document.getElementById('user-input');
const answerTextArea = document.getElementById('answer');
const objectSelect = document.getElementById('object-select');
const documentButton = document.querySelector('.document-button');
const placeholderOptions = [
  `with customer_orders as (
    select
        customer_id,
        min(order_date) as first_order_date,
        max(order_date) as most_recent_order_date,
        count(order_id) as number_of_orders
  
    from jaffle_shop.orders
  
    group by 1
  )
  
  select
    customers.customer_id,
    customers.first_name,
    customers.last_name,
    customer_orders.first_order_date,
    customer_orders.most_recent_order_date,
    coalesce(customer_orders.number_of_orders, 0) as number_of_orders
  
  from jaffle_shop.customers
  
  left join customer_orders using (customer_id)
  `, 
  `with unioned as (

    select * from {{ ref('customer_revenue_by_month') }}

    union all

    select * from {{ ref('customer_churn_month') }}

),

-- get prior month MRR and calculate MRR change
mrr_with_changes as (

    select
        *,

        coalesce(
            lag(is_active) over (partition by customer_id order by date_month),
            false
        ) as previous_month_is_active,

        coalesce(
            lag(mrr) over (partition by customer_id order by date_month),
            0
        ) as previous_month_mrr,

        mrr - previous_month_mrr as mrr_change

    from unioned

),

-- classify months as new, churn, reactivation, upgrade, downgrade (or null)
-- also add an ID column
final as (

    select
        {{  dbt_utils.surrogate_key('date_month', 'customer_id') }} as id,

        *,

        case
            when is_first_month
                then 'new'
            when not(is_active) and previous_month_is_active
                then 'churn'
            when is_active and not(previous_month_is_active)
                then 'reactivation'
            when mrr_change > 0 then 'upgrade'
            when mrr_change < 0 then 'downgrade'
        end as change_category,

        least(mrr, previous_month_mrr) as renewal_amount

    from mrr_with_changes

)

select * from final`, 
  `WITH source AS (

    SELECT *
    FROM {{ source('covid19', 'cases') }}

), renamed AS (

    SELECT 
      country_region::VARCHAR       AS country_region,
      province_state::VARCHAR       AS province_state,
      date::DATE                    AS date,
      case_type::VARCHAR            AS case_type,
      cases::NUMBER                 AS case_count,
      long::FLOAT                   AS longitude,
      lat::FLOAT                    AS latitude,
      difference::NUMBER            AS case_count_change,
      last_updated_date::TIMESTAMP  AS last_updated_date
    FROM source

)

SELECT *
FROM renamed`
];

function updateButtonVisibility() {
  const selectedOption = objectSelect.value;
  const documentButton = document.getElementById('documentButton');
  const genmetricButton = document.getElementById('genmetricButton');

  if (selectedOption === 'dModel') {
    documentButton.style.display = 'block';
    genmetricButton.style.display = 'none';
  } else if (selectedOption === 'gMetric') {
    documentButton.style.display = 'none';
    genmetricButton.style.display = 'block';
  }
}

function randomPlaceholder() {
  const randomIndex = Math.floor(Math.random() * placeholderOptions.length);
  return placeholderOptions[randomIndex];
}

function updatePlaceholder() {
  userInput.setAttribute('placeholder', randomPlaceholder());
}
//updatePlaceholder();

function updatePlaceholderByIndex(ind) {
  userInput.value = placeholderOptions[ind];
}

function clean() {
  userInput.value = '';
  answerTextArea.value = '';
}

updatePlaceholderByIndex(0);

userInput.addEventListener('click', function() {
  //userInput.value = userInput.getAttribute('placeholder');
  //userInput.value = '';
});

function spinningButton(buttonId) {
  var button = document.getElementById(buttonId);
  button.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
}

async function performDocument() {
  spinningButton("documentButton");

  const explanationContainer = document.querySelector('.explanation-container');
  explanationContainer.style.display = 'none';
  const selectedOption = objectSelect.value;
  const message = userInput.value;
  if (!message) return;
  console.log(selectedOption);
  answerTextArea.value = "Generating documentation...";

  const response = await fetch('/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: message }),
  });

  const llmReply = await response.text();

  answerTextArea.value = llmReply;

  var button = document.getElementById("documentButton");
  button.innerHTML = "Document";
}

async function generateMetric() {
  spinningButton("genmetricButton");

  const explanationContainer = document.querySelector('.explanation-container');
  explanationContainer.style.display = 'none';

  const selectedOption = objectSelect.value;
  const message = userInput.value;
  if (!message) return;
    console.log(selectedOption);
  answerTextArea.value = "Generating metric...";

  const response = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: message }),
  });

  const data = await response.json();
  const llmReply = data.result;
  const llmExplain = data.explanation;

  answerTextArea.value = llmReply;

  if (llmExplain) {
    explanationContainer.style.display = 'flex';
  } else {
    explanationContainer.style.display = 'none';
  }

  const explanationElement = document.getElementById('explanation');
  explanationElement.textContent = llmExplain;

  var button = document.getElementById("genmetricButton");
  button.innerHTML = "Generate";
}

async function performDownload() {
  spinningButton("downloadButton");

  const selectedOption = objectSelect.value;
  const text = answerTextArea.value;
  
  if (!text) return;
  
  if (selectedOption === 'gMetric') {
    const metric = answerTextArea.value;
    const response = await fetch('/generateSQL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: metric }),
    });
    const data = await response.json();
    const sqlContent = data.result;

    downloadObject(text, 'yml');
    downloadObject(sqlContent, 'sql');
  } else {
    downloadObject(text, 'md');
  }

  var button = document.getElementById("downloadButton");
  button.innerHTML = "Download";
}

function downloadObject(content, fileType){
  let filename = '';
  let mimeType = '';

  switch (fileType) {
    case 'md':
      filename = 'tql_gen_document.md';
      mimeType = 'text/markdown';
      break;
    case 'yml':
      filename = 'tql_gen_metric.yml';
      mimeType = 'text/yaml';
      break;
    case 'sql':
      filename = 'tql_gen_metric.sql';
      mimeType = 'text/sql';
      break;
    default:
      break;
  }

  const blob = new Blob([content], { type: mimeType });
  saveAs(blob, filename);
}

objectSelect.addEventListener('change', function() {  
  updateButtonVisibility();
});


userInput.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    performDocument();
  }
});

function loadFile(event) {
  const fileInput = event.target;
  const userInput = document.getElementById('user-input');

  if (fileInput.files.length === 0) {
      return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
      const contents = e.target.result;
      userInput.value = contents;
  };

  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', function() {
  var popupContainer = document.getElementById('popup-container');
  var popupCloseButton = document.getElementById('popup-close-button');
  var container = document.querySelector('.container');

  setTimeout(function() {
    popupContainer.style.display = 'block';
    container.classList.add('blur');
  }, 1234);

  popupContainer.addEventListener('click', function(event) {
    if (event.target === popupContainer) {
      popupContainer.style.display = 'none';
      container.classList.remove('blur');
    }
  });

  popupCloseButton.addEventListener('click', function() {
    popupContainer.style.display = 'none';
    container.classList.remove('blur');
  });
});