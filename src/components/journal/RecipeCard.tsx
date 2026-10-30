import type { Recipe } from "@/lib/content/schema";
import { timeLabel, totalMinutes } from "@/lib/content/recipe";

/**
 * The card at the top of a recipe post: times, servings, ingredients and numbered steps. Ingredients have
 * tick boxes for cooking along; ticks live only on the page and aren't saved anywhere.
 */
export function RecipeCard({ recipe, title }: { recipe: Recipe; title: string }) {
  const total = totalMinutes(recipe);
  const facts = [
    recipe.prepMinutes !== undefined ? ["Prep", timeLabel(recipe.prepMinutes)] : null,
    recipe.cookMinutes !== undefined ? ["Cook", timeLabel(recipe.cookMinutes)] : null,
    total !== undefined && recipe.prepMinutes !== undefined && recipe.cookMinutes !== undefined ? ["Total", timeLabel(total)] : null,
    recipe.servings ? ["Serves", recipe.servings] : null,
    recipe.cuisine ? ["Cuisine", recipe.cuisine] : null,
  ].filter((f): f is string[] => f !== null);
  return (
    <section className="card recipe" aria-labelledby="recipe-h">
      <h2 id="recipe-h">Recipe: {title}</h2>
      {facts.length ? (
        <dl className="recipe-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="recipe-cols">
        <div>
          <h3>Ingredients</h3>
          <ul className="recipe-ingredients">
            {recipe.ingredients.map((item, i) => (
              <li key={`${i}-${item}`}>
                <label>
                  <input type="checkbox" /> <span>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Steps</h3>
          <ol className="recipe-steps">
            {recipe.steps.map((step, i) => (
              <li key={`${i}-${step}`}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
